/* =====================================================================
   Booking System — 接続設定（フロント用 / 公開可）
   ---------------------------------------------------------------------
   この URL と「公開キー」を入れると「ライブモード」（Supabaseに保存）に
   切り替わります。キーが空欄なら「デモモード」（DB接続なし）で安全に動作。

   ★ ここに入れてよいのは「公開用キー」だけです：
       - 新方式： Publishable key（sb_publishable_...）  ← 今回はこちら
       - 旧方式： anon public キー（JWT）
     いずれも「ブラウザに出して良い前提」の公開鍵で、RLSで保護されます。
   ★ 次のものは絶対にここへ貼らないこと（フロント＝全世界に公開になります）：
       service_role ／ Secret key（sb_secret_...）／ DBパスワード ／ 接続文字列
   ===================================================================== */
window.MGCB_CONFIG = {
  // Supabase プロジェクト URL（/rest/v1 は付けない・末尾スラッシュ不要）
  supabaseUrl: 'https://yudabqfivpgfiqxozccu.supabase.co',

  // 公開キー：Publishable key（sb_publishable_...）。ブラウザ公開前提・RLSで保護。
  supabaseAnonKey: 'sb_publishable_jip38oY4PM5jkB6sodT4bQ_F74lyPNo',

  // 予約対象スペースの slug（schema.sql シードでは 'rental'／所属テナントは 'magic'）
  spaceSlug: 'rental',
};
