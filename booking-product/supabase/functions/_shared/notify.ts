// =====================================================================
//  予約確定メール（マルチテナント）
//  ---------------------------------------------------------------------
//  confirm_booking_paid が返す「送信ペイロード」を受け取り、テナント設定に従って
//  お客様＋オーナーへ確定メールを送る。RESEND_API_KEY 未設定なら送信せず {sent:false}。
//
//  二層送信:
//   - shared（既定）      : From = "屋号" <local@SHARED_MAIL_DOMAIN>   Reply-To = オーナー
//   - custom_domain（上位）: From = "屋号" <local@テナント検証済ドメイン>
//  From は常に「認証済みドメイン」のみ。テナントの任意アドレスは Reply-To に逃がす。
//
//  Secrets:
//   - RESEND_API_KEY      … 未設定なら無送信（非破壊）
//   - SHARED_MAIL_DOMAIN  … 例 "send.kaminendo.art"（shared モードの送信ドメイン）
// =====================================================================
import { getEmailProvider } from "./email/provider.ts";

export interface SendPayload {
  booking_id: string;
  booking_code: string;
  book_date: string;
  slot_label: string;
  plan_name: string;
  people: number;
  amount_yen: number;
  customer_name: string;
  customer_email: string;
  tenant_id: string;
  from_display_name: string | null;
  reply_to_email: string | null;
  owner_notify_email: string | null;
  sending_mode: string;
  from_local_part: string | null;
  custom_domain: string | null;
  customer_suppressed?: boolean;
}

const SHARED_MAIL_DOMAIN = Deno.env.get("SHARED_MAIL_DOMAIN") ?? "";

const yen = (n: number) => "¥" + Number(n).toLocaleString("ja-JP");

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

// ★ヘッダインジェクション対策：表示名は CR/LF・引用符・山括弧を除去
function sanitizeDisplay(s: string | null): string {
  return String(s ?? "").replace(/[\r\n"<>]/g, "").trim().slice(0, 78);
}
function sanitizeLocal(s: string | null): string {
  const v = String(s ?? "notify").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
  return v || "notify";
}

/** テナント設定から From ヘッダを組み立てる。送信ドメインが無ければ null。 */
function buildFrom(p: SendPayload): string | null {
  const display = sanitizeDisplay(p.from_display_name);
  const local = sanitizeLocal(p.from_local_part);
  let domain: string;
  if (p.sending_mode === "custom_domain" && p.custom_domain) {
    domain = p.custom_domain.trim();
  } else if (SHARED_MAIL_DOMAIN) {
    domain = SHARED_MAIL_DOMAIN;
  } else {
    return null; // 共有ドメイン未設定＝送れない
  }
  const addr = `${local}@${domain}`;
  return display ? `"${display}" <${addr}>` : addr;
}

function detailsTable(p: SendPayload): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b574e">${k}</td><td style="color:#23211c">${v}</td></tr>`;
  return `<table style="border-collapse:collapse;font-size:15px">
    ${row("予約番号", `<b>${escapeHtml(p.booking_code)}</b>`)}
    ${row("ご利用日", escapeHtml(p.book_date))}
    ${row("時間枠", escapeHtml(p.slot_label))}
    ${row("プラン", escapeHtml(p.plan_name))}
    ${row("人数", `${p.people}名`)}
    ${row("お支払い", `${yen(p.amount_yen)}（お支払い済み）`)}
  </table>`;
}

/**
 * 予約確定メールを送信。
 *  - RESEND_API_KEY 未設定 → {sent:false}（非破壊）
 *  - 送信ドメイン未設定 → {sent:false, error:'no_sender_domain'}
 *  - 送信失敗 → {sent:false, error}
 * 冪等キーで再送時の二重送信を抑止。
 */
export async function sendBookingConfirmation(
  p: SendPayload,
): Promise<{ sent: boolean; error?: string }> {
  const provider = getEmailProvider();
  if (!provider) return { sent: false }; // 非破壊

  const from = buildFrom(p);
  if (!from) return { sent: false, error: "no_sender_domain" };

  const display = sanitizeDisplay(p.from_display_name) || "MAGI-C";
  const details = detailsTable(p);
  const tags = { tenant_id: p.tenant_id, booking_id: p.booking_id };

  try {
    // お客様（サプレッション対象はスキップ）
    if (!p.customer_suppressed && p.customer_email) {
      const custHtml = `<div style="font-family:'Hiragino Sans',sans-serif;line-height:1.8;color:#23211c">
        <p>${escapeHtml(p.customer_name)} 様</p>
        <p>${escapeHtml(display)} のご予約ありがとうございます。下記の内容で承りました。</p>
        ${details}
        <p style="margin-top:16px">当日お会いできるのを楽しみにしております。</p>
        <p style="color:#8a8578;font-size:13px">※ ご返信いただけます。ご不明点はお気軽にお知らせください。</p>
      </div>`;
      await provider.send({
        from,
        to: p.customer_email,
        subject: `【${display}】ご予約を承りました（予約番号 ${p.booking_code}）`,
        html: custHtml,
        replyTo: p.reply_to_email ?? undefined,
        tags: { ...tags, kind: "customer" },
        idempotencyKey: `${p.booking_id}:customer`,
      });
    }

    // オーナー通知
    if (p.owner_notify_email) {
      const ownerHtml = `<div style="font-family:'Hiragino Sans',sans-serif;line-height:1.8;color:#23211c">
        <p>新しいご予約が入りました。</p>
        ${details}
        <p>お客様：${escapeHtml(p.customer_name)}（${escapeHtml(p.customer_email)}）</p>
      </div>`;
      await provider.send({
        from,
        to: p.owner_notify_email,
        subject: `【${display}】新規予約 ${p.book_date} ${p.slot_label}`,
        html: ownerHtml,
        replyTo: p.customer_email || undefined,
        tags: { ...tags, kind: "owner" },
        idempotencyKey: `${p.booking_id}:owner`,
      });
    }

    return { sent: true };
  } catch (e) {
    return { sent: false, error: String((e as Error)?.message ?? e) };
  }
}
