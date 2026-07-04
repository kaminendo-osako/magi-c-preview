// 共有 CORS ヘッダー。ウィジェットは iframe（別ページ）から fetch するため必要。
// 実際の安全性は「サーバー側での入力再検証」と「戻りURLの許可リスト照合」で担保する。
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
