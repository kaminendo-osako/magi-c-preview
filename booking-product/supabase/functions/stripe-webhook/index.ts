// =====================================================================
//  Edge Function: stripe-webhook
//  ---------------------------------------------------------------------
//  役割:
//   - Stripe からの Webhook を受け、★署名を必ず検証する
//   - checkout.session.completed → confirm_booking_paid()（冪等・確定）
//   - checkout.session.expired   → expire_booking()（枠解放）
//
//  config.toml で verify_jwt=false（Stripe は Supabase JWT を送らないため）。
//  DBアクセスは _shared/db.ts（新Secret keyを apikey ヘッダーのみで送る）。
// =====================================================================
import Stripe from "https://esm.sh/stripe@16?target=denonext";
import { dbRpc } from "../_shared/db.ts";
import { sendBookingConfirmation } from "../_shared/notify.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
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
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const rows = await dbRpc("confirm_booking_paid", {
          p_session_id: s.id,
          p_payment_intent: (s.payment_intent as string) ?? null,
        });
        const p = Array.isArray(rows) ? rows[0] : rows;

        // 送信可否は「まだ送っていない(confirmation_sent_at IS NULL)」で判定
        // ＝決済確定の冪等フラグと分離。webhook 再送でも未送なら送る（永久欠落を防止）。
        if (p && p.booking_id && !p.confirmation_sent_at && !p.tenant_suppressed) {
          const res = await sendBookingConfirmation({
            booking_id: p.booking_id,
            booking_code: p.booking_code,
            book_date: p.book_date,
            slot_label: p.slot_label,
            plan_name: p.plan_name,
            people: p.people,
            amount_yen: p.amount_yen,
            customer_name: p.customer_name,
            customer_email: p.customer_email,
            tenant_id: p.tenant_id,
            from_display_name: p.from_display_name,
            reply_to_email: p.reply_to_email,
            owner_notify_email: p.owner_notify_email,
            sending_mode: p.sending_mode,
            from_local_part: p.from_local_part,
            custom_domain: p.custom_domain,
            customer_suppressed: p.customer_suppressed,
          });

          if (res.sent) {
            await dbRpc("mark_confirmation_sent", { p_booking_id: p.booking_id });
          } else if (res.error && res.error !== "no_sender_domain") {
            // 実送信エラー: 記録して 500 を返し Stripe に再送させる（冪等キーで二重送信は防止）
            await dbRpc("record_confirmation_error", { p_booking_id: p.booking_id, p_error: res.error });
            console.error("[stripe-webhook] email failed, will retry:", res.error);
            return new Response("email_send_failed_retry", { status: 500 });
          }
          // res.sent=false かつ error なし/no_sender_domain → RESEND/ドメイン未設定＝非破壊で 200
        }
        break;
      }
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        await dbRpc("expire_booking", { p_session_id: s.id });
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
