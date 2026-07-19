-- =====================================================================
--  MAGI-C Booking — Phase 2-c（通知）追加スキーマ
--  ---------------------------------------------------------------------
--  前提: schema.sql / schema-payments.sql 実行済みのプロジェクトに追記実行。
--  冪等（drop→create のため何度でも安全）。SQL Editor に貼って Run。
--
--  役割: confirm_booking_paid を「確定 + 予約詳細の返却」に拡張する。
--    webhook が返却値を使って確定メール（お客様＋オーナー）を送る。
--    返り値に個人情報を含むが、この関数は **service_role 限定** なので
--    フロント（anon）からは呼べず、PII は外部に出ない。
--    updated=true は「今回この呼び出しで pending→confirmed に変わった」＝
--    初回確定のときだけ true。Webhook 再送時の二重送信を防ぐ目印。
-- =====================================================================

-- 返り値の型（void → table）を変えるため一旦 drop してから作り直す
drop function if exists public.confirm_booking_paid(text, text);

create function public.confirm_booking_paid(
  p_session_id     text,
  p_payment_intent text default null
) returns table (
  updated        boolean,
  booking_code   text,
  book_date      date,
  slot_label     text,
  plan_name      text,
  people         int,
  amount_yen     int,
  customer_name  text,
  customer_email text
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

  -- 対象予約の詳細を返す（更新できなくても既存行を返す＝冪等）
  return query
    select
      (v_id is not null) as updated,
      upper(left(replace(b.id::text, '-', ''), 8)) as booking_code,
      b.book_date, ts.label, pl.name, b.people, b.amount_yen,
      b.customer_name, b.customer_email
    from public.booking b
    join public.time_slot ts on ts.id = b.slot_id
    join public.plan pl      on pl.id = b.plan_id
    where b.stripe_session_id = p_session_id;
end;
$$;

-- 権限は決済系と同じく service_role 限定（drop で消えるため再付与）
revoke execute on function public.confirm_booking_paid(text, text) from public, anon, authenticated;
grant  execute on function public.confirm_booking_paid(text, text) to service_role;
