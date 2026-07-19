// =====================================================================
//  service-role DB ヘルパー（新API keys 対応）
//  ---------------------------------------------------------------------
//  新形式 Secret key（sb_secret_...）は **apikey ヘッダーのみ** で送る。
//  Authorization: Bearer に載せると JWT 解析エラーで権限のないロールに落ち、
//  "permission denied for table ..." になるため使わない。
//  （参考: Supabase「Migrating to publishable and secret API keys」）
// =====================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function secretKey(): string {
  // 新: SUPABASE_SECRET_KEYS は {"default":"sb_secret_..."} のJSON
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const o = JSON.parse(raw);
      return (o.default ?? Object.values(o)[0]) as string;
    } catch { /* fall through */ }
  }
  // 後方互換: 旧名（新プロジェクトでは中身が sb_secret_ になる）
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const KEY = secretKey();
const REST = `${SUPABASE_URL}/rest/v1`;
// ★ apikey のみ。Authorization は付けない。
const headers = { apikey: KEY, "Content-Type": "application/json" };

export async function dbSelect(pathAndQuery: string): Promise<any[]> {
  const r = await fetch(`${REST}/${pathAndQuery}`, { headers });
  const text = await r.text();
  if (!r.ok) throw new Error(`select_failed ${r.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

export async function dbRpc(fn: string, body: unknown): Promise<any> {
  const r = await fetch(`${REST}/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message ?? text; } catch { /* keep raw text */ }
    const e = new Error(msg) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return text ? JSON.parse(text) : null;
}
