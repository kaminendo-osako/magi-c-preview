/* =====================================================================
   MAGI-C Booking — 接続設定（フロント用）
   ---------------------------------------------------------------------
   この2つを入れると「ライブモード」（Supabaseに保存）に切り替わります。
   空欄のままなら従来どおり「デモモード」（DB接続なし）で動作します。

   ★ ここに入れてよいのは anon(public) キーだけです。
     anon キーは「ブラウザに出して良い前提」の公開鍵で、RLSで保護されます。
   ★ service_role キー（全権限・サーバー専用）は絶対にここへ貼らないこと。
     フロントに出した瞬間に全データが読み書き可能になります。
   ===================================================================== */
window.MGCB_CONFIG = {
  // Supabase プロジェクト URL（例: https://xxxxxxxx.supabase.co）
  supabaseUrl: '',

  // anon public キー（Supabase: Settings → API → Project API keys → "anon" "public"）
  supabaseAnonKey: '',

  // 予約対象スペースの slug（schema.sql のシードでは 'rental'）
  spaceSlug: 'rental',
};
