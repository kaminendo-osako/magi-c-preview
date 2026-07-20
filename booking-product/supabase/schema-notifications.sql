-- =====================================================================
--  MAGI-C Booking — Phase 2-c（通知）＋ マルチテナント・メール送信
--  ---------------------------------------------------------------------
--  前提: schema.sql / schema-payments.sql 実行済み。冪等（何度でも安全）。
--
--  設計（分析結果より）:
--   - 二層構造: Layer1=製品の共有認証ドメインから送信(From表示名=屋号 / Reply-To=オーナー)、
--     Layer2=テナント自ドメイン検証（希望テナントのみ）。From は常に「認証済みドメイン」だけ。
--   - 送信状態を決済確定から分離（booking.confirmation_sent_at）＝Resend一時失敗でも永久欠落しない。
--   - 受信者単位サプレッション（ハードバウンス/苦情した個人に再送しない）。
--   - すべて service_role 限定（anon から一切呼べない・見えない）。
-- =====================================================================

-- --------------------------------------------------------------
-- 1) テナント別 送信設定（1テナント1行）
-- --------------------------------------------------------------
create table if not exists public.tenant_notification_settings (
  tenant_id                uuid primary key references public.tenant(id) on delete cascade,
  from_display_name        text,                                  -- 屋号（空なら tenant.name にフォールバック）
  reply_to_email           text,                                  -- 返信先（お客様→ここへ返信）
  reply_to_verified_at     timestamptz,                           -- 到達検証済フラグ（将来の確認リンク用）
  owner_notify_email       text,                                  -- 新規予約をオーナーに通知する宛先
  owner_notify_verified_at timestamptz,
  sending_mode             text not null default 'shared'
                           check (sending_mode in ('shared','custom_domain')),
  from_local_part          text not null default 'notify',        -- shared時: <local>@共有ドメイン
  custom_domain            text,                                  -- custom_domain時の送信ドメイン
  provider_domain_id       text,                                  -- Resend domain id（離脱時に削除API用）
  domain_status            text not null default 'not_started'
                           check (domain_status in ('not_started','pending','verified','failed')),
  domain_checked_at        timestamptz,
  suppressed               boolean not null default false,        -- テナント全体の緊急停止
  daily_send_limit         int not null default 200,              -- テナント別 日次上限（将来のレート制御用）
  updated_at               timestamptz not null default now()
);

-- --------------------------------------------------------------
-- 2) 受信者単位サプレッション（ハードバウンス/苦情/手動）
--    ※ populate する resend-webhook は Phase B。ここでは器と参照側だけ用意。
-- --------------------------------------------------------------
create table if not exists public.email_suppression (
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  email      text not null,
  reason     text not null check (reason in ('hard_bounce','complaint','manual')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, email)
);

-- --------------------------------------------------------------
-- 3) booking に「送信状態」を追加（決済確定から分離）
-- --------------------------------------------------------------
alter table public.booking
  add column if not exists confirmation_sent_at    timestamptz,
  add column if not exists confirmation_attempts   int not null default 0,
  add column if not exists confirmation_last_error text;

-- --------------------------------------------------------------
-- 4) confirm_booking_paid：確定 ＋ 送信ペイロード（テナント設定込み）を返す
--    updated=初回確定判定。送信可否は confirmation_sent_at で別途判断（webhook側）。
--    返り値に個人情報を含むが service_role 限定のためフロントには出ない。
-- --------------------------------------------------------------
drop function if exists public.confirm_booking_paid(text, text);
create function public.confirm_booking_paid(
  p_session_id     text,
  p_payment_intent text default null
) returns table (
  updated              boolean,
  booking_id           uuid,
  confirmation_sent_at timestamptz,
  booking_code         text,
  book_date            date,
  slot_label           text,
  plan_name            text,
  people               int,
  amount_yen           int,
  customer_name        text,
  customer_email       text,
  tenant_id            uuid,
  from_display_name    text,
  reply_to_email       text,
  owner_notify_email   text,
  sending_mode         text,
  from_local_part      text,
  custom_domain        text,
  tenant_suppressed    boolean,
  customer_suppressed  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.booking
     set status = 'confirmed',
         paid_at = coalesce(paid_at, now()),
         stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id)
   where stripe_session_id = p_session_id
     and status = 'pending_payment'
  returning id into v_id;

  return query
    select
      (v_id is not null) as updated,
      b.id, b.confirmation_sent_at,
      upper(left(replace(b.id::text, '-', ''), 8)) as booking_code,
      b.book_date, ts.label, pl.name, b.people, b.amount_yen,
      b.customer_name, b.customer_email,
      t.id as tenant_id,
      coalesce(nullif(s.from_display_name, ''), t.name) as from_display_name,
      s.reply_to_email,
      s.owner_notify_email,
      coalesce(s.sending_mode, 'shared') as sending_mode,
      coalesce(s.from_local_part, 'notify') as from_local_part,
      s.custom_domain,
      coalesce(s.suppressed, false) as tenant_suppressed,
      exists (select 1 from public.email_suppression es
              where es.tenant_id = t.id and es.email = b.customer_email) as customer_suppressed
    from public.booking b
    join public.time_slot ts on ts.id = b.slot_id
    join public.plan pl      on pl.id = b.plan_id
    join public.tenant t     on t.id  = b.tenant_id
    left join public.tenant_notification_settings s on s.tenant_id = t.id
    where b.stripe_session_id = p_session_id;
end;
$$;

-- 送信成功/失敗の記録（送信状態を確定と分離して更新）
create or replace function public.mark_confirmation_sent(p_booking_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.booking
     set confirmation_sent_at = coalesce(confirmation_sent_at, now()),
         confirmation_attempts = confirmation_attempts + 1
   where id = p_booking_id;
$$;

create or replace function public.record_confirmation_error(p_booking_id uuid, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.booking
     set confirmation_attempts = confirmation_attempts + 1,
         confirmation_last_error = left(p_error, 500)
   where id = p_booking_id;
$$;

-- --------------------------------------------------------------
-- 5) MAGI-C の送信設定を初期投入（Layer1=共有ドメイン・屋号=MAGI-C）
--    reply_to / owner_notify は実アドレスをここで UPDATE して設定する:
--      update tenant_notification_settings set reply_to_email='...', owner_notify_email='...'
--       where tenant_id = (select id from tenant where slug='magic');
-- --------------------------------------------------------------
insert into public.tenant_notification_settings (tenant_id, from_display_name, sending_mode, from_local_part)
select id, 'MAGI-C', 'shared', 'notify' from public.tenant where slug = 'magic'
on conflict (tenant_id) do nothing;

-- --------------------------------------------------------------
-- 6) RLS ＆ 権限（全テーブル anon 全拒否・service_role のみ）
--    将来のオーナー管理画面は authenticated + 所有チェックで別途ポリシーを足す。
-- --------------------------------------------------------------
alter table public.tenant_notification_settings enable row level security;
alter table public.email_suppression            enable row level security;

revoke execute on function
  public.confirm_booking_paid(text, text),
  public.mark_confirmation_sent(uuid),
  public.record_confirmation_error(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.confirm_booking_paid(text, text),
  public.mark_confirmation_sent(uuid),
  public.record_confirmation_error(uuid, text)
to service_role;

grant select, insert, update on public.tenant_notification_settings to service_role;
grant select, insert, delete on public.email_suppression            to service_role;
