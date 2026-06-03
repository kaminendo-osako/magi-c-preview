-- =====================================================================
-- MAGI-C / Booking Product — Phase 2-a スキーマ（予約保存・決済なし）
-- ---------------------------------------------------------------------
-- 使い方：Supabase ダッシュボード → SQL Editor に全文を貼り付けて Run。
--         シードデータ込みなので、実行直後から動く状態になります。
--
-- 設計方針：
--   * 製品化（複数店舗での再販）を見据え、tenant（店舗）軸を最初から持つ
--   * フロントは anon(public) キーのみ使用
--       - 閲覧できるのは「マスタ情報」と「空き状況」だけ
--       - 個人情報（氏名・連絡先）は anon から SELECT できない（RLSで遮断）
--       - 予約の書き込みは SECURITY DEFINER 関数 create_booking() 経由のみ
--   * 二重予約は DB の UNIQUE 制約 ＋ 関数内チェックで原子的に防止
--   * 決済は Phase 2-b。ここには金額カラムだけ用意し、課金処理は持たない
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1) tenant（店舗）
-- ---------------------------------------------------------------------
create table if not exists public.tenant (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  timezone    text not null default 'Asia/Tokyo',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) space（予約対象：レンタルスペースの部屋／設備）
-- ---------------------------------------------------------------------
create table if not exists public.space (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  slug        text not null,
  name        text not null,
  capacity    int,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  unique (tenant_id, slug)
);

-- ---------------------------------------------------------------------
-- 3) time_slot（時間枠）
-- ---------------------------------------------------------------------
create table if not exists public.time_slot (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.space(id) on delete cascade,
  code        text not null,                 -- 'am' / 'pm' / 'eve'
  label       text not null,                 -- '10:00–12:00'
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  unique (space_id, code)
);

-- ---------------------------------------------------------------------
-- 4) plan（料金プラン）
-- ---------------------------------------------------------------------
create table if not exists public.plan (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.space(id) on delete cascade,
  code        text not null,                 -- 'basic' / 'half' / 'full'
  name        text not null,
  note        text,
  price_yen   int  not null check (price_yen >= 0),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  unique (space_id, code)
);

-- ---------------------------------------------------------------------
-- 5) closed_weekday（定休曜日：0=日 … 6=土）
-- ---------------------------------------------------------------------
create table if not exists public.closed_weekday (
  space_id    uuid not null references public.space(id) on delete cascade,
  weekday     int  not null check (weekday between 0 and 6),
  primary key (space_id, weekday)
);

-- ---------------------------------------------------------------------
-- 6) date_block（個別の休業・貸切）
--    slot_id NULL = その日「終日」 / 指定あり = その枠だけ
--    block_type 'closed'   = 臨時休業（カレンダー上は「定休」扱い）
--               'blackout' = 貸切などで予約不可（カレンダー上は「満」扱い）
--    ※カフェ貸切に伴うレンタル不可など、在庫連動はここに1行入れて表現する
-- ---------------------------------------------------------------------
create table if not exists public.date_block (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.space(id) on delete cascade,
  block_date  date not null,
  slot_id     uuid references public.time_slot(id) on delete cascade,
  block_type  text not null default 'blackout' check (block_type in ('closed','blackout')),
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_date_block_lookup on public.date_block (space_id, block_date);

-- ---------------------------------------------------------------------
-- 7) booking（予約）
--    confirmed のときだけ (space_id, book_date, slot_id) を一意化。
--    → キャンセルすると枠が空く（部分ユニークインデックス）
-- ---------------------------------------------------------------------
create table if not exists public.booking (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenant(id) on delete cascade,
  space_id       uuid not null references public.space(id) on delete cascade,
  slot_id        uuid not null references public.time_slot(id),
  plan_id        uuid not null references public.plan(id),
  book_date      date not null,
  people         int  not null default 1 check (people between 1 and 100),
  customer_name  text not null check (char_length(customer_name)  between 1 and 100),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  customer_tel   text not null check (char_length(customer_tel)   between 1 and 30),
  amount_yen     int  not null default 0,        -- Phase 2-bの決済用。今は記録のみ
  status         text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  note           text,
  created_at     timestamptz not null default now()
);
create unique index if not exists uq_booking_slot_confirmed
  on public.booking (space_id, book_date, slot_id)
  where status = 'confirmed';
create index if not exists idx_booking_calendar on public.booking (space_id, book_date) where status = 'confirmed';

-- =====================================================================
-- RLS（行レベルセキュリティ）
--   フロントは anon(public) キー。
--   マスタ系 = anon に SELECT 許可（公開情報）。
--   booking / date_block = anon 向けポリシーを「作らない」＝既定で全拒否。
--     → 個人情報は漏れない。空き状況は下の関数だけが（状態のみ）返す。
-- =====================================================================
alter table public.tenant         enable row level security;
alter table public.space          enable row level security;
alter table public.time_slot      enable row level security;
alter table public.plan           enable row level security;
alter table public.closed_weekday enable row level security;
alter table public.date_block     enable row level security;
alter table public.booking        enable row level security;

drop policy if exists "read tenant"   on public.tenant;
drop policy if exists "read space"    on public.space;
drop policy if exists "read slot"     on public.time_slot;
drop policy if exists "read plan"     on public.plan;
drop policy if exists "read cweekday" on public.closed_weekday;

create policy "read tenant"   on public.tenant         for select to anon, authenticated using (true);
create policy "read space"    on public.space          for select to anon, authenticated using (is_active);
create policy "read slot"     on public.time_slot      for select to anon, authenticated using (is_active);
create policy "read plan"     on public.plan           for select to anon, authenticated using (is_active);
create policy "read cweekday" on public.closed_weekday for select to anon, authenticated using (true);
-- ※ booking と date_block にはポリシーを作らない（= anon からは全拒否）

-- テーブル権限（RLSと二重の守り）。booking/date_block には付与しない。
grant usage on schema public to anon, authenticated;
grant select on public.tenant, public.space, public.time_slot, public.plan, public.closed_weekday
  to anon, authenticated;

-- =====================================================================
-- 関数① month_availability：指定スペース・指定月の各日状態を返す
--   返り値 status: 'closed'（過去/定休/臨時休業） | 'full'（貸切・満） | 'open'
--   SECURITY DEFINER で booking/date_block を内部参照（個人情報は返さない）
-- =====================================================================
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
  -- 終日ブロック（slot_id is null）
  fullday as (
    select db.block_date, bool_or(db.block_type = 'closed') as any_closed
    from date_block db
    where db.space_id = p_space_id and db.slot_id is null
    group by db.block_date
  ),
  -- 枠単位で埋まっている数（confirmed予約 ＋ 枠ブロック）
  used as (
    select u.book_date, count(distinct u.slot_id) as used_slots
    from (
      select b.book_date, b.slot_id from booking b
        where b.space_id = p_space_id and b.status = 'confirmed'
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
      when exists (select 1 from fullday f where f.book_date = days.d and f.any_closed) then 'closed'
      when exists (select 1 from fullday f where f.book_date = days.d) then 'full'
      when v_slot_count > 0
        and coalesce((select used_slots from used u where u.book_date = days.d), 0) >= v_slot_count
        then 'full'
      else 'open'
    end as status
  from days
  order by days.d;
end;
$$;

-- =====================================================================
-- 関数② day_slots：指定日の枠ごとの空き（available=true なら予約可能）
--   日付を選んだ後、埋まっている枠をフロントで無効化するために使う
-- =====================================================================
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
          and b.slot_id = s.id and b.status = 'confirmed'
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

-- =====================================================================
-- 関数③ create_booking：予約作成（原子的）。anon から RPC 経由でのみ実行。
--   * 過去日 / 定休 / ブロック / 入力不備を拒否
--   * 既に埋まっていれば 'slot_taken'（UNIQUE制約が最終防御）
--   * 返すのは予約ID（UUID）のみ。個人情報は返さない。
-- =====================================================================
create or replace function public.create_booking(
  p_space_id  uuid,
  p_slot_code text,
  p_plan_code text,
  p_date      date,
  p_people    int,
  p_name      text,
  p_email     text,
  p_tel       text
) returns uuid
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

  insert into public.booking (
    tenant_id, space_id, slot_id, plan_id, book_date, people,
    customer_name, customer_email, customer_tel, amount_yen, status
  ) values (
    v_tenant, p_space_id, v_slot, v_plan.id, p_date, least(greatest(coalesce(p_people,1),1),100),
    trim(p_name), lower(trim(p_email)), trim(p_tel), v_plan.price_yen, 'confirmed'
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'slot_taken';
end;
$$;

-- anon から呼べるように EXECUTE 権限を付与
grant execute on function public.month_availability(uuid,int,int)               to anon, authenticated;
grant execute on function public.day_slots(uuid,date)                           to anon, authenticated;
grant execute on function public.create_booking(uuid,text,text,date,int,text,text,text) to anon, authenticated;

-- =====================================================================
-- シード（MAGI-C 初期データ）。現状プロトタイプの config に一致させてある。
-- 値は本番に合わせて後から変更可。
-- =====================================================================
do $$
declare
  t  uuid;
  sp uuid;
begin
  insert into public.tenant (slug, name) values ('magic', 'MAGI-C')
    on conflict (slug) do nothing;
  select id into t from public.tenant where slug = 'magic';

  insert into public.space (tenant_id, slug, name, capacity, sort_order)
    values (t, 'rental', 'レンタルスペース', 10, 0)
    on conflict (tenant_id, slug) do nothing;
  select id into sp from public.space where tenant_id = t and slug = 'rental';

  insert into public.time_slot (space_id, code, label, sort_order) values
    (sp, 'am',  '10:00–12:00', 0),
    (sp, 'pm',  '13:00–16:00', 1),
    (sp, 'eve', '17:00–21:00', 2)
    on conflict (space_id, code) do nothing;

  insert into public.plan (space_id, code, name, note, price_yen, sort_order) values
    (sp, 'basic', '基本利用',   '1時間〜', 3000,  0),
    (sp, 'half',  '半日プラン', '4時間',   9000,  1),
    (sp, 'full',  '1日プラン',  '8時間',   16000, 2)
    on conflict (space_id, code) do nothing;

  insert into public.closed_weekday (space_id, weekday) values (sp, 2)  -- 火曜定休
    on conflict do nothing;
end $$;

-- =====================================================================
-- 動作確認用クエリ（任意・実行しなくてよい）
--   select * from month_availability(
--     (select id from space where slug='rental'),
--     extract(year from current_date)::int,
--     extract(month from current_date)::int
--   );
-- =====================================================================
