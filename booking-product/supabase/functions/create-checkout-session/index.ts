// =====================================================================
//  Edge Function: create-checkout-session
//  ---------------------------------------------------------------------
//  役割:
//   1) フロント(ウィジェット)から予約内容を受け取る（★金額は受け取らない）
//   2) 戻りURLの origin を許可リストと照合（オープンリダイレクト防止）
//   3) create_pending_booking() で空き・プラン・料金をDB側で再検証し、
//      status='pending_payment' の仮押さえを作成（金額はDBの plan.price_yen）
//   4) Stripe Checkout Session を作成し、URL をフロントへ返す
//   5) セッションIDを予約に紐付ける
//
//  秘密情報（STRIPE_SECRET_KEY / secret key）は Supabase Secrets のみ。
//  DBアクセスは _shared/db.ts（新Secret keyを apikey ヘッダーのみで送る）。
// =====================================================================
import Stripe from "https://esm.sh/stripe@16?target=denonext";
import { corsHeaders, json } from "../_shared/cors.ts";
import { dbSelect, dbRpc } from "../_shared/db.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// カンマ区切りの許可 origin（例: "https://kaminendo-osako.github.io,http://localhost:5500"）
const ALLOWED_RETURN_ORIGINS = (Deno.env.get("ALLOWED_RETURN_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const HOLD_MINUTES = 45;            // 仮押さえの有効期限
const CHECKOUT_EXPIRE_MINUTES = 32; // Checkout の失効（仮押さえより短く保つ）

const originAllowed = (u: string): boolean => {
  try {
    return ALLOWED_RETURN_ORIGINS.includes(new URL(u).origin);
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const b = await req.json();
    const {
      space_slug, slot_code, plan_code, date, people,
      name, email, tel, success_url, cancel_url,
    } = b ?? {};

    // 戻りURLの検証（オープンリダイレクト防止）
    if (!originAllowed(success_url) || !originAllowed(cancel_url)) {
      return json({ error: "invalid_return_url" }, 400);
    }

    // space_slug → space_id
    const spaces = await dbSelect(
      `space?slug=eq.${encodeURIComponent(space_slug ?? "rental")}&is_active=eq.true&select=id&limit=1`,
    );
    const space = spaces[0];
    if (!space) return json({ error: "invalid_space" }, 400);

    // 仮押さえ作成（検証 + 金額決定は全てDB側）
    let pend: { booking_id: string; amount_yen: number } | undefined;
    try {
      const rows = await dbRpc("create_pending_booking", {
        p_space_id: space.id,
        p_slot_code: slot_code,
        p_plan_code: plan_code,
        p_date: date,
        p_people: people,
        p_name: name,
        p_email: email,
        p_tel: tel,
        p_hold_minutes: HOLD_MINUTES,
      });
      pend = Array.isArray(rows) ? rows[0] : rows;
    } catch (e) {
      const msg = (e as Error).message ?? "booking_failed";
      const known = [
        "slot_taken", "closed_day", "blocked_slot", "past_date",
        "invalid_slot", "invalid_plan", "missing_customer_info",
        "input_too_long", "invalid_email", "invalid_space",
      ];
      const code = known.find((k) => msg.includes(k)) ?? "booking_failed";
      const status = (code === "slot_taken" || code === "blocked_slot" || code === "closed_day") ? 409 : 400;
      return json({ error: code }, status);
    }
    if (!pend) return json({ error: "booking_failed" }, 400);

    const bookingId = pend.booking_id;
    const amountYen = pend.amount_yen;

    // Stripe Checkout Session（★金額はDB由来の amountYen のみ）
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "jpy",
          unit_amount: amountYen,
          product_data: { name: `MAGI-C レンタルスペース ご予約（${date}）` },
        },
      }],
      customer_email: email,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRE_MINUTES * 60,
      success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url,
      metadata: { booking_id: bookingId },
    });

    await dbRpc("attach_checkout_session", {
      p_booking_id: bookingId,
      p_session_id: session.id,
    });

    return json({ url: session.url }, 200);
  } catch (e) {
    console.error("[create-checkout-session]", e);
    return json({ error: "server_error" }, 500);
  }
});
