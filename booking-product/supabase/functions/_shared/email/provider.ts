// =====================================================================
//  EmailProvider 境界（プラガブル）
//  ---------------------------------------------------------------------
//  送信の実装をここに閉じ込める。将来 SES 等へ移行するときは SesProvider を
//  足して getEmailProvider() の分岐を変えるだけ。notify.ts は触らない。
// =====================================================================
export interface SendParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  tags?: Record<string, string>;       // {tenant_id, booking_id, kind} バウンス帰属用
  idempotencyKey?: string;             // 再送時の二重送信をプロバイダ側で防ぐ
  headers?: Record<string, string>;    // List-Unsubscribe 等の拡張余地
}

export interface EmailProvider {
  send(p: SendParams): Promise<{ messageId: string }>;
}

class ResendProvider implements EmailProvider {
  #key: string;
  constructor(key: string) {
    this.#key = key;
  }
  async send(p: SendParams): Promise<{ messageId: string }> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.#key}`,
      "Content-Type": "application/json",
    };
    if (p.idempotencyKey) headers["Idempotency-Key"] = p.idempotencyKey;

    const body: Record<string, unknown> = {
      from: p.from,
      to: p.to,
      subject: p.subject,
      html: p.html,
    };
    if (p.replyTo) body["reply_to"] = p.replyTo;
    if (p.headers) body["headers"] = p.headers;
    if (p.tags) {
      // Resend のタグは name/value とも [a-zA-Z0-9_-] のみ許可
      const clean = (v: string) => String(v).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 256);
      body["tags"] = Object.entries(p.tags).map(([name, value]) => ({
        name: clean(name),
        value: clean(value),
      }));
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
    const data = await r.json().catch(() => ({}));
    return { messageId: (data as { id?: string }).id ?? "" };
  }
}

/** RESEND_API_KEY 未設定なら null（＝非破壊：送信せず素通り）。 */
export function getEmailProvider(): EmailProvider | null {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return null;
  return new ResendProvider(key);
}
