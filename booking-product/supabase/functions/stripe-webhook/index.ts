// =====================================================================
//  Edge Function: stripe-webhook
//  ---------------------------------------------------------------------
//  役割:
//   - Stripe からの Webhook を受け、★署名を必ず検証する
//   - checkout.session.completed → confirm_booking_paid()（冪等・確定）
//   - checkout.session.expired   → expire_booking()（枠解放）
//
//  config.toml で verify_jwt=false（Stripe は Supabase JWT を送らないため）。
//  STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY / SERVICE_ROLE は Secrets のみ。
// =====================================================================
import Stripe from "https://esm.sh/stripe@16?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing signature");
    event = await stripe.webhooks.constructEventAsync(
      raw, signature, webhookSecret, undefined, cryptoProvider,
    );
  } catch (e) {
    console.error("[stripe-webhook] signature verify failed:", (e as Error).message);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        await supabase.rpc("confirm_booking_paid", {
          p_session_id: s.id,
          p_payment_intent: (s.payment_intent as string) ?? null,
        });
        break;
      }
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        await supabase.rpc("expire_booking", { p_session_id: s.id });
        break;
      }
      default:
        // 他イベントは無視（200を返す）
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
    return new Response("handler_error", { status: 500 });
  }
});
