-- =====================================================================
--  MAGI-C Booking — Phase 2-b（Stripe Checkout / 決済）追加スキーマ
--  ---------------------------------------------------------------------
--  前提: schema.sql を実行済みのプロジェクトに、この差分を追記実行する。
--  すべて冪等（何度実行しても安全）。SQL Editor に貼って Run。
--
--  決済フロー（方式B：仮押さえ→確定）:
--    1) Edge Function が create_pending_booking() で status='pending_payment'
--       の予約を作成（有効期限 = now()+45分）。金額は plan.price_yen から決定。
--    2) Stripe Checkout（失効32分）へ誘導。
--    3) webhook の checkout.session.completed → confirm_booking_paid() で
--       status='confirmed'。checkout.session.expired → expire_booking()。
--    ※ 仮押さえ(45分) > Checkout失効(32分) なので、支払い完了は必ず
--      pending_payment のうちに届く（期限切れとの競合を回避）。
--    ※ 二重予約防止は UNIQUE 索引（confirmed + pending_payment）が最終防御。
-- =====================================================================

-- --------------------------------------------------------------
-- 1) booking テーブル拡張
-- --------------------------------------------------------------
alter table public.booking
  add column if not exists expires_at                timestamptz,
  add column if not exists stripe_session_id         text,
  add column if not exists stripe_payment_intent_id  text,
  add column if not exists paid_at                   timestamptz;

-- Stripe セッションIDは一意（同一セッションからの二重確定を防ぐ）
create unique index if not exists uq_booking_stripe_session
  on public.booking (stripe_session_id)
  where stripe_session_id is not null;

-- status に pending_payment / expired を追加
alter table public.booking drop constraint if exists booking_status_check;
alter table public.booking
  add constraint booking_status_check
  check (status in ('pending_payment','confirmed','cancelled','expired'));

-- Studio 表示用の日本語ステータス（生成列・常に status と同期）
alter table public.booking
  add column if not exists status_label text
  generated always as (
    case status
      when 'pending_payment' then '決済待ち'
      when 'confirmed'       then '確定'
      when 'cancelled'       then 'キャンセル'
      when 'expired'         then '期限切れ'
      else status
    end
  ) stored;

-- 二重予約防止の索引を「確定 + 仮押さえ」に拡大
--   （期限切れの pending は create_pending_booking / webhook で 'expired' に
--     掃き替えるため、索引からも空き状況からも外れる）
drop index if exists uq_booking_slot_confirmed;
create unique index if not exists uq_booking_slot_active
  on public.booking (space_id, book_date, slot_id)
  where status in ('confirmed','pending_payment');

-- --------------------------------------------------------------
-- 2) 空き状況関数を「未失効の仮押さえも占有」とみなすよう更新
--    （占有 = confirmed または (pending_payment かつ expires_at > now())）
-- --------------------------------------------------------------
create or replace function public.month_availability(
  p_space_id uuid,
  p_year     int,
  p_month    int
) returns table (d date, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := make_date(p_year, p_month, 1);
  v_end   date := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  v_slot_count int;
begin
  select count(*) into v_slot_count
    from time_slot where space_id = p_space_id and is_active;

  return query
  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as d
  ),
  fullday as (
    select db.block_date, bool_or(db.block_type = 'closed') as any_closed
    from date_block db
    where db.space_id = p_space_id and db.slot_id is null
    group by db.block_date
  ),
  used as (
    select u.book_date, count(distinct u.slot_id) as used_slots
    from (
      select b.book_date, b.slot_id from booking b
        where b.space_id = p_space_id
          and (b.status = 'confirmed'
               or (b.status = 'pending_payment' and b.expires_at > now()))
      union
      select db.block_date as book_date, db.slot_id from date_block db
        where db.space_id = p_space_id and db.slot_id is not null
    ) u
    group by u.book_date
  )
  select
    days.d,
    case
      when days.d < current_date then 'closed'
      when exists (
        select 1 from closed_weekday cw
        where cw.space_id = p_space_id and cw.weekday = extract(dow from days.d)::int
      ) then 'closed'
      when exists (select 1 from fullday f where f.block_date = days.d and f.any_closed) then 'closed'
      when exists (select 1 from fullday f where f.block_date = days.d) then 'full'
      when v_slot_count > 0
        and coalesce((select used_slots from used u where u.book_date = days.d), 0) >= v_slot_count
        then 'full'
      else 'open'
    end as status
  from days
  order by days.d;
end;
$$;

create or replace function public.day_slots(
  p_space_id uuid,
  p_date     date
) returns table (slot_id uuid, code text, label text, sort_order int, available boolean)
language sql
security definer
set search_path = public
as $$
  select
    s.id, s.code, s.label, s.sort_order,
    (
      p_date >= current_date
      and not exists (
        select 1 from booking b
        where b.space_id = p_space_id and b.book_date = p_date
          and b.slot_id = s.id
          and (b.status = 'confirmed'
               or (b.status = 'pending_payment' and b.expires_at > now()))
      )
      and not exists (
        select 1 from date_block db
        where db.space_id = p_space_id and db.block_date = p_date
          and (db.slot_id is null or db.slot_id = s.id)
      )
    ) as available
  from time_slot s
  where s.space_id = p_space_id and s.is_active
  order by s.sort_order;
$$;

-- --------------------------------------------------------------
-- 3) 期限切れ仮押さえの掃き替え（占有を解放）
-- --------------------------------------------------------------
create or replace function public.release_expired_holds()
returns void
language sql
security definer
set search_path = public
as $$
  update public.booking
     set status = 'expired'
   where status = 'pending_payment'
     and expires_at is not null
     and expires_at < now();
$$;

-- --------------------------------------------------------------
-- 4) 仮押さえ予約の作成（Edge Function から service_role で呼ぶ）
--    - create_booking と同じ検証。status='pending_payment'・期限つき。
--    - 金額はフロントから受け取らず plan.price_yen を返す。
-- --------------------------------------------------------------
create or replace function public.create_pending_booking(
  p_space_id     uuid,
  p_slot_code    text,
  p_plan_code    text,
  p_date         date,
  p_people       int,
  p_name         text,
  p_email        text,
  p_tel          text,
  p_hold_minutes int default 45
) returns table (booking_id uuid, amount_yen int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_slot   uuid;
  v_plan   public.plan%rowtype;
  v_id     uuid;
begin
  -- 入力検証（create_booking と同一）
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_email),'') = '' or coalesce(trim(p_tel),'') = '' then
    raise exception 'missing_customer_info';
  end if;
  if char_length(trim(p_name))  > 100
     or char_length(trim(p_email)) > 254
     or char_length(trim(p_tel))   > 30 then
    raise exception 'input_too_long';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if p_date < current_date then
    raise exception 'past_date';
  end if;

  select tenant_id into v_tenant from space where id = p_space_id and is_active;
  if v_tenant is null then raise exception 'invalid_space'; end if;

  select id into v_slot from time_slot
    where space_id = p_space_id and code = p_slot_code and is_active;
  if v_slot is null then raise exception 'invalid_slot'; end if;

  select * into v_plan from plan
    where space_id = p_space_id and code = p_plan_code and is_active;
  if v_plan.id is null then raise exception 'invalid_plan'; end if;

  if exists (
    select 1 from closed_weekday
    where space_id = p_space_id and weekday = extract(dow from p_date)::int
  ) then
    raise exception 'closed_day';
  end if;

  if exists (
    select 1 from date_block
    where space_id = p_space_id and block_date = p_date
      and (slot_id is null or slot_id = v_slot)
  ) then
    raise exception 'blocked_slot';
  end if;

  -- 先に期限切れ仮押さえを解放（UNIQUE 索引の空きを作る）
  perform public.release_expired_holds();

  insert into public.booking (
    tenant_id, space_id, slot_id, plan_id, book_date, people,
    customer_name, customer_email, customer_tel, amount_yen, status, expires_at
  ) values (
    v_tenant, p_space_id, v_slot, v_plan.id, p_date, least(greatest(coalesce(p_people,1),1),100),
    trim(p_name), lower(trim(p_email)), trim(p_tel), v_plan.price_yen, 'pending_payment',
    now() + make_interval(mins => greatest(coalesce(p_hold_minutes,45),5))
  )
  returning id into v_id;

  booking_id := v_id;
  amount_yen := v_plan.price_yen;
  return next;
exception
  when unique_violation then
    raise exception 'slot_taken';
end;
$$;

-- --------------------------------------------------------------
-- 5) Stripe セッションIDの紐付け（Edge Function から）
-- --------------------------------------------------------------
create or replace function public.attach_checkout_session(
  p_booking_id uuid,
  p_session_id text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.booking
     set stripe_session_id = p_session_id
   where id = p_booking_id and status = 'pending_payment';
$$;

-- --------------------------------------------------------------
-- 6) 決済成功 → 確定（webhook から・冪等）
-- --------------------------------------------------------------
create or replace function public.confirm_booking_paid(
  p_session_id     text,
  p_payment_intent text default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.booking
     set status = 'confirmed',
         paid_at = coalesce(paid_at, now()),
         stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id)
   where stripe_session_id = p_session_id
     and status = 'pending_payment';
$$;

-- --------------------------------------------------------------
-- 7) Checkout 失効 → 期限切れ（webhook から）
-- --------------------------------------------------------------
create or replace function public.expire_booking(
  p_session_id text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.booking
     set status = 'expired'
   where stripe_session_id = p_session_id
     and status = 'pending_payment';
$$;

-- --------------------------------------------------------------
-- 8) 決済後の戻り画面用：ステータスと短縮予約番号のみ（PIIは返さない）
-- --------------------------------------------------------------
create or replace function public.booking_public_status(
  p_session_id text
) returns table (status text, status_label text, booking_code text)
language sql
security definer
set search_path = public
as $$
  select b.status, b.status_label, upper(left(replace(b.id::text,'-',''),8))
  from public.booking b
  where b.stripe_session_id = p_session_id;
$$;

-- --------------------------------------------------------------
-- 9) 権限（最重要）
--    - 決済系の書き込み関数は service_role（Edge Functions）だけが実行可。
--      anon から直接呼べると「決済せず確定」できてしまうため必ず遮断する。
--    - 空き状況・戻り画面ステータスは anon 可（PIIは返さない）。
-- --------------------------------------------------------------
revoke execute on function
  public.create_pending_booking(uuid,text,text,date,int,text,text,text,int),
  public.attach_checkout_session(uuid,text),
  public.confirm_booking_paid(text,text),
  public.expire_booking(text),
  public.release_expired_holds()
from public, anon, authenticated;

grant execute on function
  public.create_pending_booking(uuid,text,text,date,int,text,text,text,int),
  public.attach_checkout_session(uuid,text),
  public.confirm_booking_paid(text,text),
  public.expire_booking(text),
  public.release_expired_holds()
to service_role;

grant execute on function public.booking_public_status(text) to anon, authenticated, service_role;
grant execute on function public.month_availability(uuid,int,int) to anon, authenticated, service_role;
grant execute on function public.day_slots(uuid,date)            to anon, authenticated, service_role;

-- 管理閲覧用ビュー（Supabase Studio の SQL Editor 等で確認する用途）
--   個人情報を含むため anon には公開しない（RLS/GRANT を付けない）。
create or replace view public.booking_admin_ja as
  select
    b.book_date        as "予約日",
    ts.label           as "時間枠",
    pl.name            as "プラン",
    b.customer_name    as "氏名",
    b.customer_tel     as "電話",
    b.customer_email   as "メール",
    b.people           as "人数",
    b.amount_yen       as "金額",
    b.status_label     as "ステータス",
    b.paid_at          as "決済日時",
    b.expires_at       as "仮押さえ期限",
    b.created_at       as "申込日時"
  from public.booking b
  join public.time_slot ts on ts.id = b.slot_id
  join public.plan pl      on pl.id = b.plan_id
  order by b.created_at desc;
