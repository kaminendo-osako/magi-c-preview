// =====================================================================
//  予約確定メール（Resend）
//  ---------------------------------------------------------------------
//  RESEND_API_KEY が未設定なら「何もしない」＝非破壊（決済フローは通常どおり）。
//  設定されると、確定時に お客様＋オーナー へ確認メールを送る。
//  プロバイダ差し替えを想定し、送信部だけ差し替えれば SendGrid 等にも対応可。
//
//  必要な Secrets（設定するまで送信されない）:
//   - RESEND_API_KEY          … Resend の API キー
//   - NOTIFICATION_FROM       … 送信元（例 "MAGI-C <yoyaku@bebest-magic.com>"）
//                               未設定時は Resend のテスト送信元にフォールバック
//   - OWNER_NOTIFICATION_EMAIL… オーナーの受信先（未設定ならオーナー通知はスキップ）
// =====================================================================
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("NOTIFICATION_FROM") ?? "MAGI-C <onboarding@resend.dev>";
const OWNER = Deno.env.get("OWNER_NOTIFICATION_EMAIL");

export interface BookingInfo {
  updated?: boolean;
  booking_code: string;
  book_date: string;
  slot_label: string;
  plan_name: string;
  people: number;
  amount_yen: number;
  customer_name: string;
  customer_email: string;
}

const yen = (n: number) => "¥" + Number(n).toLocaleString("ja-JP");

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function detailsTable(info: BookingInfo): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b574e">${k}</td><td style="color:#23211c">${v}</td></tr>`;
  return `<table style="border-collapse:collapse;font-size:15px">
    ${row("予約番号", `<b>${escapeHtml(info.booking_code)}</b>`)}
    ${row("ご利用日", escapeHtml(info.book_date))}
    ${row("時間枠", escapeHtml(info.slot_label))}
    ${row("プラン", escapeHtml(info.plan_name))}
    ${row("人数", `${info.people}名`)}
    ${row("お支払い", `${yen(info.amount_yen)}（お支払い済み）`)}
  </table>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
}

/** 予約確定メールを送信。RESEND_API_KEY 未設定なら送信せず {sent:false} を返す（非破壊）。 */
export async function sendBookingConfirmation(
  info: BookingInfo,
): Promise<{ sent: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { sent: false }; // フラグOFF＝非破壊
  try {
    const details = detailsTable(info);

    // お客様向け
    const custHtml = `<div style="font-family:'Hiragino Sans',sans-serif;line-height:1.8;color:#23211c">
      <p>${escapeHtml(info.customer_name)} 様</p>
      <p>MAGI-C レンタルスペースのご予約ありがとうございます。下記の内容で承りました。</p>
      ${details}
      <p style="margin-top:16px">当日お会いできるのを楽しみにしております。</p>
      <p style="color:#8a8578;font-size:13px">※ 本メールは送信専用です。ご不明点はお問い合わせください。</p>
    </div>`;
    await sendEmail(
      info.customer_email,
      `【MAGI-C】ご予約を承りました（予約番号 ${info.booking_code}）`,
      custHtml,
    );

    // オーナー向け
    if (OWNER) {
      const ownerHtml = `<div style="font-family:'Hiragino Sans',sans-serif;line-height:1.8;color:#23211c">
        <p>新しいご予約が入りました。</p>
        ${details}
        <p>お客様：${escapeHtml(info.customer_name)}（${escapeHtml(info.customer_email)}）</p>
      </div>`;
      await sendEmail(
        OWNER,
        `【MAGI-C】新規予約 ${info.book_date} ${info.slot_label}（${escapeHtml(info.customer_name)}様）`,
        ownerHtml,
      );
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: String((e as Error)?.message ?? e) };
  }
}
