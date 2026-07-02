# MAGI-C 制作記録と計画

千葉・南柏の **レンタルスペース兼・完全予約制カフェ「MAGI-C」** のHP制作および
予約＋決済システム開発の、進捗・計画・禁止事項をまとめたマスタードキュメント。

> 併せて必ず読むこと： `../HP制作_Claude_Code_運用ルール.md`（全案件共通の運用ルール）
> 本ファイルは、その共通ルールを **MAGI-C案件向けに具体化** したもの。
> 最終更新：2026-07-02

---

## 0. 最重要メッセージ（最初に読む）

**「AIっぽいサイト・テンプレっぽいサイト」になることが、この案件で最も避けたい失敗。**
きれいに整っていても、どこかで見たようなLP・無機質なカードの羅列・写真のない箱だけのページは
**作り直し対象**とみなす。詳細は [5. 禁止事項](#5-禁止事項マジックの命綱) を参照。

また、現在の成果物は **撮影前の仮画像（手書き風／水彩風）を挿入したデザインプロトタイプ** であり、まだ「完成」ではない。
仮画像はあくまで空間の方向性を示すための仮置きで、**本番の実写真ではない**。
**実写真・実コピー・空間の質感**が入って初めて、MAGI-Cの「高級感×さわやかさ」は成立する。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|---|---|
| 店名 | MAGI-C（マジック） |
| 立地 | 千葉県柏市・南柏 |
| 業態 | レンタルスペース ＋ 完全予約制カフェ |
| 価格方針 | 南柏エリアでは強気の価格設定。**高級感・値段相応**を保つ |
| トーン | 同時に、**地域交流の場としてのさわやかさ・親しみ**も残す（先方の明確な要望） |
| 運用方針 | 公開後の軽微更新は **オーナー＋制作者の役割分担**（日常更新＝オーナー、難改修＝制作者） |

### ターゲットと「助かる瞬間」
- レンタルスペースを探している人（教室・撮影・小規模イベント・ワークショップ等）
- 落ち着いた完全予約制カフェで過ごしたい人
- 「予約から支払いまでスマホで完結したい」人 → だから **LINE導線と予約UIの使いやすさ**が要

---

## 2. 確定済みの方針（崩さない前提）

### 2-1. 決済設計
- **カフェ ＝ 予約のみ・現地決済**（オンライン決済なし＝決済手数料ゼロ）
- **レンタルスペース ＝ 事前オンライン決済**

### 2-2. カフェの予約方式（Amelia不使用）
- カフェは完全予約制だが **「貸切」ではなく席予約**。よって **Amelia は使わない**。
- HPでは **営業カレンダー**で「営業／貸切／定休」を確認できるようにし、
  実際の予約は **公式LINE** で受ける。
- **レンタルスペースの貸切がある日はカフェ利用不可**（在庫が連動する）。

### 2-3. LINE連携
- **LIFFのエンドポイント＝HPの予約ページURL** にするだけで成立（プラットフォーム非依存）。
- LINE公式アカウントのリッチメニューから「レンタル予約／カフェ予約／お問い合わせ」へ誘導。
- ⚠ **LINE Notify は終了済み**。通知が必要なら **LINE Messaging API** を使う。

### 2-4. 全体構成（ハイブリッド／2026-06-03確定）
- **HP本体 ＝ WordPress**（運用性・更新性・コスト・既存経験を重視）。
- **予約＋決済システム ＝ 別の独立プロダクトとして開発**（サイト非依存・埋め込み型）。
  - 理由：**すでにHPを持つ他店にも単体販売できる資産**にしたい。Amelia はサイト単位ライセンスで再販向きでない。
- **決済はプラガブル（差し替え可能）に設計**：Stripeを基本としつつ、審査に応じて Square・銀行振込なども有効化できる形がベスト（先方要望）。
- 決済はお金が絡むため慎重に。**Stripe Checkout 等のホスト型でPCI範囲を最小化**し、段階導入する。

---

## 3. これまでにやってきたこと（成果物）

作業フォルダ：`C:\RYUフォルダ\021_HP制作\MAGI-C`
> 現段階はすべて **静的HTML/CSS/JS のデザイン確認用プロトタイプ**。WordPressテーマ化・本番バックエンドはこれから。

### 3-1. サイト本体（デザイン骨組み）
| ファイル | 役割 | 状態 |
|---|---|---|
| `index.html` | トップ（世界観／各機能への導線／姉妹店／アクセス／LINE CTA） | 骨組み完成・**仮画像挿入済み**／本番写真は後日差し替え |
| `facilities.html` | 設備一覧（6カード＋料金表。料金表は横スクロール対応済み） | 骨組み完成・**仮画像挿入済み**／本番写真は後日差し替え |
| `rental.html` | レンタル予約（4ステップ説明＋事前決済の注記＋**予約ウィジェット埋め込み**） | 骨組み完成・仮画像挿入済み・**ウィジェット埋め込み済み（2026-07-02・ライブ接続／テスト環境の注意書きつき）** |
| `cafe.html` | カフェ予約（営業カレンダー＋LINE誘導。Amelia不使用） | 骨組み完成・**仮画像挿入済み** |
| `contact.html` | お問い合わせフォーム（送信未接続のプレースホルダ）＋LINE | 骨組み完成・**OGP設定済み** |
| `access.html` | アクセス（情報リスト＋Google Maps iframe） | 骨組み完成・**OGP設定済み** |
| `assets/css/style.css` | デザインシステム（下記トークン／レスポンシブ／カレンダー） | 完成 |
| `assets/js/main.js` | ヘッダー追従・モバイルナビ・営業カレンダー・スクロール表示 | 完成 |

**デザイントークン**（`.mgcb`プロダクト側と統一感を持たせている）
- 配色：cream `#f7f4ec` / paper `#fffdf8` / ink `#23211c` / sage `#7c8a6e` / brass `#b08d4f`
- フォント：見出し＝Shippori Mincho（明朝）、本文＝Zen Kaku Gothic New、欧文アクセント＝Cormorant Garamond

**実施済みの品質対応**
- 文字バランス：`text-wrap: balance/pretty`、和文禁則 `line-break: strict`、PC/スマホ別の改行制御（`.br-pc`）
- スマホ最適化：`@media (max-width:600px / 380px)` を拡充。**375pxで横スクロールなし**を確認
- カフェ営業カレンダー：定休（火）・貸切日を判別表示（※現状はデモ用の仮データ）

### 3-2. 予約＋決済プロダクト（再販可能な独立ウィジェット）
フォルダ：`booking-product/`
| ファイル | 役割 |
|---|---|
| `widget.html` | 埋め込みウィジェット本体。`.mgcb` 1要素に全スコープした自己完結UI |
| `assets/widget.css` | ウィジェット専用CSS（`--mgcb-*`トークン。ホストサイトと干渉しない） |
| `assets/widget.js` | 予約エンジン。`config`で項目・料金・**決済プロバイダ**を差し替え可能 |
| `demo-host.html` | 「既存の別サイト」に `<iframe>` 1行で埋め込むデモ（別配色・別フォント） |

**ウィジェットの仕様**
- 4ステップ：①ご利用日＋時間枠＋プラン → ②お客様情報 → ③確認＋お支払い方法 → ④完了
- カレンダーは過去日・定休日・貸切日を自動で選択不可
- 決済プロバイダは `config.payments[]` で表現：Stripe＝有効、Square／銀行振込＝「準備中」
  → **審査が通った決済手段をフラグ1つで有効化**できる（プラガブル設計）

**検証結果（2026-06-03、プレビューで確認）**
- 各ステップのゲーティング（必須が揃うまで「次へ」無効）：OK
- サマリー（日付/時間/プラン/人数/¥3,000）正しく反映：OK
- 無効な決済手段は選択不可、Stripe選択→完了画面にプロバイダ名表示：OK
- **PC・スマホ375pxとも横スクロールなし**、カレンダー崩れなし：OK
- demo-host：iframe内でウィジェットが正常動作・スタイル非干渉：OK

---

## 4. これからの計画（ロードマップ）

> 大原則：**お金が絡む決済は最後**。まず「決済なしで予約が回る」状態を固めてから決済を足す。

### Phase 1（完了）— 静的デザインプロトタイプ
HPの世界観・導線・予約UIの動きを、コードで触れる形に。← **いまここまで完了**

### Phase 2-a — 予約データの保存＋管理画面（決済なし）← **完了（2026-07-02 接続・検証・公開済み）**

#### 接続・公開ステータス（2026-07-02）
- **Supabase接続済み**：`supabase-config.js` に Project URL（`https://yudabqfivpgfiqxozccu.supabase.co`）＋ **Publishable key**（新キー体系・公開可）を設定。tenant slug＝`magic`／space slug＝`rental`。
- **検証済み**：①`booking`直SELECT＝401拒否 ②`month_availability`＝`{d,status}`のみ ③`day_slots`＝枠+availableのみ（いずれも個人情報なし） ④ライブ予約保存OK ⑤同枠の二重予約＝`slot_taken`拒否 ⑥予約後にUI満枠反映 ⑦375px横スクロールなし ⑧コンソールエラーなし。
- **バグ修正**：`month_availability` の `f.book_date`→`f.block_date`（schema.sql修正済み・Supabase側も再実行済み）。
- **確認用公開**：GitHub Pages（下記 6-2 参照）。rental.html にウィジェットを iframe 埋め込み（テスト環境の注意書きつき）。
- **Supabase**（Postgres）で予約・空き状況・貸切/定休を永続化
- オーナー用の簡易管理は、当面 **Supabase Studio（管理画面）** をそのまま使う（サーバー不要）。予約一覧の閲覧／貸切・臨時休業の登録／定休の変更がすべてStudioで可能
- カフェの「貸切日はカフェ不可」連動は `date_block` に1行入れて表現（在庫連動の土台）
- **構成の判断（確定）**：決済が来る Phase 2-b まで Next.js/サーバーは立てない。**Supabaseのみ（サーバーレス）**でフロントから直接読む。理由＝ウィジェットを「どのサイトにも貼れる自己完結」に保つ＋秘匿情報をサーバーに置く必要がまだ無い。
- **セキュリティ設計**：
  - フロントは **anon(public) キーのみ**。マスタ情報と「空き状況」しか見えない（RLSで個人情報を遮断）
  - 予約の書き込みは `create_booking` 関数（SECURITY DEFINER）経由のみ。二重予約は **DBのUNIQUE制約**で最終防御
  - **service_role キーはフロントに絶対出さない**（[5-7](#5-7-技術セキュリティの禁止事項) 厳守）
- **作成済み成果物**：
  - `booking-product/supabase/schema.sql` … テーブル7種＋RLS＋関数3種（`month_availability` / `day_slots` / `create_booking`）＋MAGI-C初期シード。Supabaseに貼って実行するだけ
  - `booking-product/assets/supabase-config.js` … URL＋anonキーを入れる枠（空ならデモ動作）
  - `booking-product/assets/widget.js` … **資格情報があればDB接続、無ければ従来デモ**の二段構え（既存デモは非破壊と確認済み）

#### データモデル（schema.sql）
| テーブル | 役割 |
|---|---|
| `tenant` | 店舗（再販を見据え最初から複数店舗対応） |
| `space` | 予約対象（レンタルスペースの部屋/設備） |
| `time_slot` | 時間枠（10:00–12:00 等） |
| `plan` | 料金プラン（基本/半日/1日） |
| `closed_weekday` | 定休曜日（火曜=2） |
| `date_block` | 個別の臨時休業・貸切（終日 or 枠単位／在庫連動の要） |
| `booking` | 予約。`confirmed`時のみ(スペース×日付×枠)を一意化＝二重予約不可 |

#### オーナー/ユーザーが Supabase で行う手順（接続のために必要）
1. [supabase.com](https://supabase.com) で無料プロジェクトを作成（**Region：Northeast Asia (Tokyo)** 推奨）
2. 左メニュー **SQL Editor** に `booking-product/supabase/schema.sql` の全文を貼って **Run**（初期データ込みで即動く）
3. **Settings → API** を開き、次の **2つだけ** を制作者に共有：
   - **Project URL**（例：`https://xxxx.supabase.co`）
   - **anon public** キー（`service_role` は共有しない／フロントに出さない）
4. その2つを `supabase-config.js` に貼ると、ウィジェットが「デモ」→「本番保存」に切り替わる
5. 日々の運用は **Table Editor / SQL Editor** で：
   - 予約確認＝`booking` を開く
   - 貸切や臨時休業＝`date_block` に行を追加（終日なら `slot_id` 空、特定枠なら枠を指定）
   - 定休変更＝`closed_weekday`、料金変更＝`plan`
- **必要なもの：ユーザー側で Supabase アカウント（無料枠で可）＋上記2値の共有**
- **次の検証（接続後に一緒に行う）**：実際に1件予約→`booking`に保存→同じ枠は満で再予約不可、をテスト

### Phase 2-b — Stripe Checkout 接続（レンタルの事前決済）
- レンタルのみ事前決済。**Stripe Checkout（ホスト型）でPCI範囲を最小化**
- テストモードで「枠選択→事前決済→予約確定メール」まで通し確認
- **必要なもの：ユーザー側で Stripe アカウント＋店舗/本人審査**

### Phase 3 — プロダクト化（他店への販売）
- マルチテナント化（店舗ごとの設定・決済プロバイダ切替）
- 埋め込みスニペット配布・ドキュメント整備
- ※ 2が固まってから設計する

### Phase 4 — HP本体のWordPress化・本番公開
- WordPressテーマ化、ドメイン取得（候補：`magi-c.jp` 等／空き要確認）、サーバー契約（SSL・自動バックアップ込み）
- LINE公式アカウント作成・リッチメニュー・LIFFエンドポイント設定
- **写真・実コピーの流し込み**（→ これが無いと「完成」ではない）

### 直近で人間（オーナー/ユーザー）に必要な判断・準備
> Phase 2-a は **接続・検証・公開まで完了（2026-07-02）**。論点は「依頼者確認」「実写真」「Stripe準備」に移っている。
1. **テスト予約の削除**：検証で作った 2026-06-18 am 枠のテスト予約（テスト太郎）が `confirmed` のまま＝満枠表示中。[6-3](#6-3-runbookテスト予約の削除オーナーも実施可) の手順で削除する
2. **本番写真の受領→差し替え**（撮影は完了済み・受領待ち。差し替え手順は [8-6](#8-6-実写真に差し替えるときの注意)）
3. **Stripe アカウントの用意**（Phase 2-b 用。審査に時間がかかるため早めに着手推奨）
4. **2026-07-06 依頼者ヒアリング**：文言・写真の方向性・料金や住所等の実値・LINE公式の準備状況を確認

### 意思決定ログ（2026-07-02）
| 論点 | 決定 |
|---|---|
| 完了文言 | 「ご予約を保存しました」のまま。テスト環境の明示は **rental.html 側の注意書き＋共有文面** で行う（ウィジェット本体は再販プロダクトのため無改変） |
| テスト予約の扱い | **開発中は削除運用**（公開後の実予約キャンセルは `status='cancelled'` で枠解放） |
| 公開中のライブ予約 | **当面有効のまま**（依頼者が実際に試せる状態を優先） |
| カフェ予約 | **LINE予約で確定**。ウィジェットへの席予約統合は行わない（Phase 3 設計から除外） |
| 料金・時間枠 | 仮値（¥3,000/9,000/16,000・3枠・火曜定休）のまま依頼者確認へ。実値確定後に `plan`/`time_slot`/`closed_weekday` を更新 |
| Supabase Studio | **オーナーも操作する前提**でRunbookを整備（[6-3](#6-3-runbookテスト予約の削除オーナーも実施可)） |
| 本番写真 | 撮影完了済み。受領次第差し替え |

---

## 5. 禁止事項（マジックの命綱）

> 出典：`../HP制作_Claude_Code_運用ルール.md` を MAGI-C 向けに具体化。
> **ここが守れていなければ、見た目が整っていても未完成とみなす。**

### 5-0. 【最重要】AIっぽい・テンプレっぽいサイトにしない
以下はすべて **作り直し対象**：
- どこかで見たテンプレLP／全ページが同じカードUIに見える
- 写真がなく、文字とカードだけの無機質なページ（**今のプロトタイプはこの危険地帯にいる**）
- 抽象コピーだけで、南柏のMAGI-Cらしさが伝わらない
- フォント・余白・見出しの温度感がすべて同じで、強弱がない
- 画像生成AI感が強すぎる／ストックフォト感が強すぎる

**MAGI-Cで必ず効かせる「人の気配・空間の質感」：**
- 自然光の入る空間、木やグリーンのニュアンス、コーヒーの湯気やカップのディテール
- レンタルスペースが「使われている」場面（ワークショップ・撮影・少人数の集まり）
- 利用者が会話している・くつろいでいる様子（＝商品単体ではなく“その後の空気”）
- 「高級感」＝余白と上質な写真、「さわやかさ」＝人の自然な表情と光で表現

### 5-1. いきなり実装しない
目的・ターゲット・導線・デザイン方針・素材方針・技術構成を確認し、計画（本ファイル／plan）に記録してから進める。既存ファイルを読まずに修正しない。

### 5-2. 写真の禁止事項と方針
- **写真なしで「完成」扱いにしない。**
- 物単体（コーヒーだけ・空間だけ）を見せて終わらない。**導入後の体験・場の空気**を見せる。
- 画像生成AIを使う場合：手指の破綻・文字/ロゴ入り・過剰な発光・日本の現場に見えない画像は使わない。
  指示に含める：`realistic editorial photography, natural light, warm tone, no text, no logos, avoid stock photo look`。
- 必要カット例：トップHero／レンタル空間（使用シーン）／カフェの席と一杯／ディテール／OGP用。
- 当面は仮画像でもよいので世界観を作り、後で実写に差し替える。

### 5-3. コピーの禁止事項
- 「最高の体験」「価値を最大化」「想いをカタチに」等の **どの店にも当てはまる抽象コピーは禁止**。
- 具体的な状況が見える言葉にする（例：「打ち合わせにも、撮影にも。南柏で“ちょうどいい”を借りる。」のように用途が浮かぶ表現）。

### 5-4. 見出し・改行の禁止事項
- H1/H2に安易な `、` `。` を入れない。句読点なしで成立する短いコピーを優先。
- スマホで「1文字だけ／句読点だけ／『ます』だけ」が次行に回る改行は禁止。`.br-pc`等で制御し、PCが不自然なら出し分ける。

### 5-5. 文字量の禁止事項
- Hero説明は2〜3文、カード本文は1〜2文まで。同義反復をしない。画像が入るぶん文章は削る。

### 5-6. 導線（CTA）の禁止事項
- 問い合わせ/予約導線がページ最下部だけ、は禁止。**Hero直下・中盤・最下部**に配置。
- 「レンタル予約」「カフェはLINEで予約」など、**そのページ固有の文言**にする。

### 5-7. 技術・セキュリティの禁止事項
- 古い知識・終了サービスを使わない（**LINE Notifyは使わない → Messaging API**）。
- 秘匿情報をフロントに出さない。**Stripeシークレットキー・Supabaseのservice roleキー等は必ずサーバー側**。
  `NEXT_PUBLIC_`（公開される接頭辞）に秘密情報を入れない。
- 無料枠の制限・公式の最新仕様を確認してから設計する。

---

## 6. 検証環境・プレビュー方法

- 静的プレビュー：`python -m http.server 5500`（`.claude/launch.json` に `magic-static` を定義済み）
- サイト：`http://localhost:5500/`
- 予約ウィジェット：`http://localhost:5500/booking-product/widget.html`
- 埋め込みデモ：`http://localhost:5500/booking-product/demo-host.html`
- スマホ確認幅：**375 / 390 / 430px**。H1改行・CTA折り返し・ハンバーガー・カレンダー・文字圧迫感を確認。
- ※ 本環境ではスクリーンショットが撮れないため、**最終の見た目は必ずブラウザ／実機で目視**する。

### 6-2. Runbook：確認用プレビュー（GitHub Pages）
> **本番公開ではない**。依頼者確認用のプレビュー。全ページ `noindex,nofollow` 付与済み。

| 項目 | 値 |
|---|---|
| リポジトリ | https://github.com/kaminendo-osako/magi-c-preview |
| 公開URL | https://kaminendo-osako.github.io/magi-c-preview/ |
| 予約ウィジェット | rental.html に埋め込み済み（直URL：`/booking-product/widget.html`） |
| 配信設定 | Pages＝Deploy from a branch／`main`／`/root` |
| 反映方法 | `main` に push → 数分で自動反映 |

**push前チェック（毎回）**：①`git diff` で秘密情報（`service_role`/`sb_secret`/DBパスワード/接続文字列/Stripe・LINEシークレット）が無い ②`.claude/`・`素材/` が追跡されていない（.gitignore済み） ③OGP・noindex が崩れていない。
**本番公開時に戻すもの**：①全8ページの `noindex,nofollow` を削除 ②OGPのURLをプレビューURL→本番ドメインへ ③rental.html の「確認用テスト環境」noticeを削除 ④必要ならライブ予約キーの扱いを再判断。

### 6-3. Runbook：テスト予約の削除（オーナーも実施可）
> 方針（2026-07-02決定）：**開発中のテスト予約は削除**する。`confirmed` のまま残すと**その枠が満枠扱い**になり実予約をブロックするので注意。

**Supabase Studio（画面操作）での手順：**
1. https://supabase.com/dashboard → 対象プロジェクト → 左メニュー **Table Editor** → `booking`
2. 削除したい行（テスト予約）を確認（`customer_name`・`book_date` で見分ける）
3. 行左端のチェック → **Delete rows** → 確認して実行
4. 直後から該当枠が「空き」に戻る（ウィジェットのカレンダーに反映）

**SQL Editor でまとめて消す場合（例）：**
```sql
-- テスト用メールアドレスの予約を削除
delete from booking where customer_email = 'test@example.com';
```

**公開後の実予約をキャンセルする場合（削除しない）：** 該当行の `status` を `cancelled` に変更（枠が解放され、履歴は残る）。
**貸切・臨時休業の登録／定休変更**は従来どおり `date_block`／`closed_weekday`（[4章の運用手順](#オーナーユーザーが-supabase-で行う手順接続のために必要) 参照）。

---

## 7. 実装時の確認ルール（毎回）

**実装前に提示：** ①現状分析 ②変更予定ファイル ③変更方針 ④影響範囲 ⑤壊してはいけない機能
**実装後に提示：** ①修正ファイル ②変更内容 ③ビルド/動作確認結果 ④PC表示 ⑤スマホ表示 ⑥残課題 ⑦次に人間が確認すべきこと

---

## 8. 写真・仮画像（手書き風／水彩風）の方針

> **目的**：写真がない「文字とカードだけの無機質なサイト」を避ける（最重要禁止事項 5-0）。
> 実写真は後日撮影予定。それまでは **手書き風・水彩風・建築スケッチ風の仮イメージ** を置き、
> 空間の方向性だけ伝える。**仮画像は完成素材ではなく、必ず実写真に差し替える。**
> リアル系AI実写はストックフォト感・AIっぽさが出やすいため、現段階では使わない。

### 表現する方向性 / 避ける方向性
- **出す**：南柏の落ち着いた空間／高級だが冷たくない／さわやかで親しみ／自然光／木の質感／グリーン／コーヒー／少人数の会話／ワークショップ・打ち合わせ利用／完全予約制の静けさ／レンタル利用の様子
- **避ける**：AI実写っぽさ／海外高級ホテル風／無人のきれいな箱だけ／ストックフォト感／アニメ調／ファンタジー調／**店名MAGI-Cからの安易な魔法・星・キラキラ演出**／ロゴ・文字入り／手や顔が不自然な人物／暗いバー・ラウンジ調

### 8-0. 実装ステータス（2026-06-03 反映済み・仮画像）
> 仮画像10枚を最適化（PNG→JPEG、Pillow）し `assets/images/placeholders/` に配置、各ページへ差し込み完了。**Supabase接続・予約保存ロジックには一切触れていない（画像差し込みと予約保存は別作業）**。素材原本は `素材/`（プロジェクト外）に保持。**いずれも最終的に実写真へ差し替える前提**。

**採用した画像と配置（実装結果）：**
| 配置 | ファイル | 実装メモ |
|---|---|---|
| index：Hero背景 | `home-hero.jpg`（1916×821／361KB） | CSS `.hero__media` の背景に重ね、左を濃くした暗幕グラデで文字可読性を確保。旧 `::after` の「ヒーロー写真…」注記は削除 |
| index：Concept | `home-concept.jpg`（1280×960／301KB） | `.media-frame--photo`（4:3）に `<img>`。水彩イラスト調でHeroと画風統一 |
| cafe：紹介節（**新規追加**） | `cafe-scene3.jpg`（1280×672／230KB） | page-heroの直下に `.split` 紹介節を新設（横長シネマティック） |
| rental：紹介節（**新規追加**） | `rental-space.jpg`（1280×960／299KB） | ステップの上に `.split` 紹介節を新設。既存の点線「予約カレンダー表示エリア」枠は不変 |
| facilities：紹介節（**新規追加**） | `facility.jpg`（1280×960／314KB） | カードグリッドの上に `.split` 紹介節を新設（キッチン・調理器具） |
| 全6ページ `<head>` | `ogp.jpg`（1200×630／152KB） | center-crop。文字（「日常の延長にある、上質なひととき。」「MAGI-C CAFE & LOUNGE」「COFFEE / ALCOHOL / MUSIC / WORK」）は**崩れず判読可**＝再生成不要。`og:image` + width/height + `twitter:card=summary_large_image`。**公開ドメイン確定後に絶対URLへ差し替え（HTMLコメントで明記）** |

**差し替え候補（不採用・HTMLコメントにも記載）：** Concept=`home-concept2.jpg`（実写調＋文字入り。Heroの水彩調と画風が異なるため候補どまり）／cafe=`cafe-scene.jpg`・`cafe-scene2.jpg`（後者はコラージュ＋文字）／facilities補助=`facility2.jpg`（席レイアウト図。英字ラベル入りのため当面未使用）。

**実装した最小CSS（`assets/css/style.css`）：** `.media-frame{ overflow:hidden }`、`.media-frame img{ position:absolute; inset:0; width/height:100%; object-fit:cover; border-radius:inherit }`、`.media-frame--photo{ aspect-ratio:4/3 }`。写真を入れた枠は `data-label` を外し画面に注記を出さない。Sister節は実素材がないため従来のプレースホルダ（`data-label`）維持。各 `<img>` は `loading="lazy"`・`width/height`付きでレイアウトシフト防止。

**検証済み（2026-06-03 / `python -m http.server 5500`）：** ①PC(1280)・モバイル(375)で全6ページ横スクロールなし ②`object-fit:cover`で自然にトリミング（Concept等は4:3素材＝無クロップ） ③Hero文字の可読性OK ④画像は各143〜361KB（元PNG2〜3MBから軽量化）・コンテンツ画像はlazy ⑤予約ウィジェットの4ステップはデモのまま正常動作（日付→時間→プラン→情報→確認→完了、サマリー¥3,000） ⑥`supabase-config.js`空＝**デモモード維持**（Stripeデモ完了メッセージを確認） ⑦コンソールエラーなし。

### 8-1. 設置場所（どのページのどこに入れるか）
- 既存デザインに **`.hero__media`（Hero背景）** と **`.media-frame`（コンセプト/姉妹店の写真枠）** が用意済み → ここに差し込めば最小変更。
- カフェページは現状ゼロ画像で無機質リスクが最も高い → 1枚必ず入れる。

### 8-2. 仮画像の管理（実装済み／差し替え候補／今後の候補）
> 実装の詳細（配置・実装メモ・検証結果）は [8-0](#8-0-実装ステータス2026-06-03-反映済み仮画像) を参照。ここでは素材を「実装済み」「差し替え候補」「今後の候補」に区分して管理する。

**(A) 実装済み**（`assets/images/placeholders/` に配置・各ページで使用中）
| ファイル名 | ページ・場所 | 比率 | alt案（実写差し替え後もそのまま使える自然な説明） |
|---|---|---|---|
| `home-hero.jpg` | index：Hero背景（`.hero__media`） | 約21:9 | 装飾背景（H1が意味を担うためaltなし可） |
| `home-concept.jpg` | index：Concept節（`.media-frame--photo`） | 4:3 | 自然光が差し込む、木のテーブルとソファ席の落ち着いた店内 |
| `cafe-scene3.jpg` | cafe：紹介節（新設） | 約1.9:1 | 窓辺の光がやわらかく届くカフェと、淹れたてのコーヒー |
| `rental-space.jpg` | rental：紹介節（新設） | 4:3 | 木の大テーブルとソファを備えた多目的なレンタルスペース |
| `facility.jpg` | facilities：紹介節（新設） | 4:3 | ドリッパーやケトル、鍋などをそろえたキッチンまわり |
| `ogp.jpg` | 全6ページ`<head>` | 1200×630 | OGP用（alt不要・文字入りデザイン済み） |

**(B) 差し替え候補**（`placeholders/` に保管・**現在は未使用**。各HTMLのコメントにも明記）
| ファイル名 | 想定差し替え先 | メモ |
|---|---|---|
| `home-concept2.jpg` | index Concept | 実写調＋文字入り。Heroの水彩調と画風が異なるため候補どまり |
| `cafe-scene.jpg` | cafe 紹介節 | 文字なしのクリーンな水彩調。落ち着いた構図 |
| `cafe-scene2.jpg` | cafe | コラージュ＋文字（チラシ寄り）。単体使用には不向き |
| `facility2.jpg` | facilities 補助 | 席レイアウト図。英字ラベル入りのため当面未使用 |

**(C) 今後必要になったら作る候補**（**未作成**。命名規則・生成プロンプトは 8-5 に温存）
- `home-sister.jpg`（index Sister節。現在は実素材がなく `data-label` プレースホルダのまま）
- `facility-multipurpose / kitchen / workspace / av / furniture / amenity .jpg`（設備6カードを個別写真化する場合）
- `pagehero-band.jpg`（下層 `.page-hero` 背景を薄く敷く場合）

### 8-3. 命名・フォルダ規則
- 仮画像：`assets/images/placeholders/`　／　実写真（最終）：`assets/images/`
- **ファイル名は仮も最終も同一**にする（例：`home-hero.jpg`）。差し替えは「フォルダ階層を1つ上げる＝パスの `placeholders/` を消す」だけ。
- 拡張子は `.jpg` で統一（**OGPも `.jpg`**）。WebP化・`srcset`は最終最適化フェーズで。

### 8-4. アスペクト比方針
- Hero：**21:9（最低16:9）**／Heroは全画面背景なので `cover` で中央クロップ。被写体は中央〜やや右に、左上は文字用に空ける。
- 特集ヴィネット（concept・sister）：**4:3**（将来の横位置の実内観写真に合う。現状フレームは4:5なので実装時に1行だけ4:3へ調整）。
- カード画像：**3:2**／カフェ・レンタル単体：**4:3**／OGP：**1200×630（≈1.91:1）**。

### 8-5. 生成プロンプト案
**共通スタイル（全画像の語尾に付ける・統一感を保つ）：**
```
loose watercolor with fine ink architectural sketch lines, hand-drawn editorial illustration,
soft natural daylight, warm ivory paper tone with muted sage green and subtle brass accents,
light natural wood, a few green plants, generous negative space, calm airy serene mood,
muted desaturated palette, visible brush washes and gentle pencil lines
```
**共通ネガティブ（避けたい方向性）：**
```
no text, no letters, no logos, no watermark; not a photo, not photorealistic, no 3D render;
no anime, no cartoon, no fantasy, no magic, no stars, no sparkles, no glow;
no people with distorted hands or faces; not dark, no bar or nightclub mood;
avoid stock-photo look, avoid generic luxury-hotel look
```
**被写体（上記＝スタイル＋ネガティブと組み合わせる）：**
- `home-hero`：calm interior of a rental space & reservation cafe in soft morning light, large windows, light wood tables, potted greenery, simple ceramic coffee cups, wide panoramic composition, calm empty space on the upper-left
- `home-concept`：a quiet corner with a wooden table by a bright window, one coffee cup and a small vase of greenery, soft shadows, inviting
- `cafe-scene`：close warm view of a single pour-over coffee cup on a wooden table by a window, soft steam, a sprig of green, intimate and quiet
- `home-sister`：a small welcoming storefront with greenery beside the entrance, soft daylight, neighborhood warmth (no signage)
- `facility-multipurpose`：bright open multipurpose room, flexible empty wooden floor, a few neatly placed chairs
- `facility-kitchen`：clean simple kitchen counter in daylight, a few utensils, tidy
- `facility-workspace`：calm work corner, small desk with a notebook and a cup, a power outlet nearby
- `facility-av`：a soft projection screen and projector in a calm room, two chairs facing it
- `facility-furniture`：neatly arranged tables and chairs in a bright room, flexible layout
- `facility-amenity`：a small tea/water station with cups and a folded towel, simple and clean
- `pagehero-band`：very light airy abstract watercolor wash hinting at a sunlit interior with faint plant shadows, mostly pale empty ivory space (faint background)
- `rental-space`：a small workshop/class scene in a bright room, a few people seated around a wooden table (faces kept soft/loose), warm and friendly
- `ogp`：balanced composition of the cafe interior with natural light, wooden table, coffee cup and greenery, calm, with quiet space reserved (do not draw any text)

### 8-6. 実写真に差し替えるときの注意
1. **同名・同比率で撮る/書き出す** → パスの `placeholders/` を消すだけ（HTML/CSS改修ほぼ不要）。
2. Hero・OGPは**文字が乗る余白（セーフゾーン）**を意識して撮影。
3. `object-fit:cover` で中央クロップ。被写体が偏る場合のみ `object-position` を1行調整。
4. alt は仮のままでOK（シーン説明にしてあるため）。撮影内容が違えば自然な説明に更新。
5. 仮であることを示す **HTMLコメント・`data-label`・CSSの `::after` 注記を削除**。
6. 実写真は軽量化（リサイズ・圧縮、可能ならWebP＋`srcset`）。
7. 本ドキュメントの仮画像ステータスを「本番写真差し替え済み」に更新する（0章・3章の表・8-0・8-2(A)）。
   ※ 仮画像の挿入自体は 2026-06-03 に完了済み（[8-0](#8-0-実装ステータス2026-06-03-反映済み仮画像)）。残りは実写真への差し替え時の対応。

### 8-7. 既存デザインを壊さない実装方針（実装済み・下記方針で反映。詳細は 8-0）
- **Hero**：HTML変更なし。`.hero__media` の背景に画像を追加（暗いグラデを画像の上に重ねて文字可読性を維持）。
  ```css
  .hero__media{ background:
    linear-gradient(180deg, rgba(20,18,14,.45), rgba(20,18,14,.55)),
    url('../images/placeholders/home-hero.jpg') center/cover no-repeat; }
  ```
- **特集ヴィネット/カフェ**：`.media-frame` の中に `<img object-fit:cover>` を入れるだけ。追加CSSは1ルール。
  ```css
  .media-frame > img{ width:100%; height:100%; object-fit:cover; border-radius:inherit; display:block; }
  ```
  （比率を4:3にするなら `.media-frame{ aspect-ratio:4/3; }` の1行。`data-label`は画像挿入時に外す）
- **設備カード（推奨）**：各 `.card` 先頭に `<img class="card__img">` を追加。追加CSS：
  ```css
  .card__img{ width:100%; aspect-ratio:3/2; object-fit:cover; border-radius:var(--radius); margin-bottom:18px; }
  ```
- **OGP**：`<head>` に `og:image`（**本番は絶対URL**）＋ `og:image:width/height` ＋ `twitter:card=summary_large_image`。
- いずれも **加算的な変更**（既存の文字・レイアウトを壊さない）。`loading="lazy"`（Heroのみ優先読み込み）、比率指定でレイアウトシフト防止。

---

## 9. 関連ファイル
- 共通運用ルール：`../HP制作_Claude_Code_運用ルール.md`
- 詳細プラン：`C:\Users\Ryuta Osako\.claude\plans\magi-c-line-hp-purrfect-marble.md`
- サイト本体：`index.html` ほか／`assets/css/style.css`／`assets/js/main.js`
- 予約プロダクト：`booking-product/`（`widget.html`・`demo-host.html`・`assets/`）
- Phase 2-a（Supabase）：`booking-product/supabase/schema.sql`（スキーマ＋RLS＋関数＋シード）／`booking-product/assets/supabase-config.js`（URL＋anonキーの設定枠）
