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
//  秘密情報（STRIPE_SECRET_KEY / SERVICE_ROLE）は Supabase Secrets のみ。
//  フロントには一切出さない。
// =====================================================================
import Stripe from "https://esm.sh/stripe@16?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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
    const { data: space, error: spErr } = await supabase
      .from("space").select("id")
      .eq("slug", space_slug ?? "rental").eq("is_active", true).single();
    if (spErr || !space) return json({ error: "invalid_space" }, 400);

    // 仮押さえ作成（検証 + 金額決定は全てDB側）
    const { data: pend, error: pErr } = await supabase.rpc("create_pending_booking", {
      p_space_id: space.id,
      p_slot_code: slot_code,
      p_plan_code: plan_code,
      p_date: date,
      p_people: people,
      p_name: name,
      p_email: email,
      p_tel: tel,
      p_hold_minutes: HOLD_MINUTES,
    }).single();

    if (pErr) {
      const msg = pErr.message ?? "booking_failed";
      const known = ["slot_taken", "closed_day", "blocked_slot", "past_date"];
      const status = known.some((k) => msg.includes(k)) ? 409 : 400;
      // メッセージから既知コードだけ抽出して返す（内部詳細は漏らさない）
      const code = known.find((k) => msg.includes(k)) ?? "booking_failed";
      return json({ error: code }, status);
    }

    const bookingId: string = (pend as { booking_id: string }).booking_id;
    const amountYen: number = (pend as { amount_yen: number }).amount_yen;

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

    await supabase.rpc("attach_checkout_session", {
      p_booking_id: bookingId,
      p_session_id: session.id,
    });

    return json({ url: session.url }, 200);
  } catch (e) {
    console.error("[create-checkout-session]", e);
    return json({ error: "server_error" }, 500);
  }
});
