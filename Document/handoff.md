# 引継ぎ資料（2026-11-13 時点）

次のチャット（または別の担当者）が作業を続けるための資料です。要件は [project.md](project.md)、実装の進め方は [build-prompt.md](build-prompt.md) を参照してください。

## 1. 現在地

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | Next.js + Supabase の雛形、DB スキーマ・RLS | 完了 |
| 2 | ログイン（メール / Google / Discord）、新規登録で 3 トークン付与 | 完了（Google / Discord の OAuth 設定は未確認）。CAPTCHA（Turnstile）と使い捨てメールの拒否を 2026-11-12 に追加 |
| 3 | テンプレート一覧・エディタ（3D プレビュー、画像・色・拡大縮小・位置・回転・明るさ・彩度、元に戻す） | 完了 |
| 4 | 作品の保存・再編集・マイ作品、ログイン前の編集内容の引き継ぎ | 完了 |
| 5 | unitypackage のサーバー生成、トークン消費、購入済みの版の再ダウンロード、ダウンロード履歴 | 完了 |
| 6 | ギミック 16 種、Prefab の自動組み立て、ギミック追加分だけの課金 | 完了（VRChat 上での同期は未確認） |
| 7 | トークン購入・有効期限切れの記録 | 完了（Stripe のテスト環境で確認済み。本番の利用開始は規約類の公開と本番公開のあと。設定は [stripe-setup.md](stripe-setup.md)） |
| 8 | 導入ガイド・規約類・管理画面 | 完了（main にマージ済み）。規約類の文面は確認用の下書き。導入ガイドの画像は 2026-11-12 に Unity で撮影して追加 |
| 9 | テストの整備 | 完了（main にマージ済み）。単体テスト・DB 関数のテスト・Unity の手動確認の手順書・GitHub Actions |

- サービス名は **VRPrintLab**（ロゴ・ファビコンは `web/images/common`）。リポジトリ名・フォルダ名は VRC-DressDrop のまま
- **ブランチ**: すべての作業は `main` にマージ済み。`templates` は main と同じ位置（`de3e3f9` 以降の main の変更は、次にテンプレートを追加するときに templates で `git merge main` して取り込む）。GitHub の main・templates はローカルと同じ位置まで push 済み（2026-11-13 時点。push は利用者が行う）。デザインの見直しは `feature/site-design-refresh` ブランチ（main へのマージは利用者の確認後）
- **2026-11-12〜11-13 に入れた主な変更**（すべて main）
  - 新規登録・ログイン・パスワード再設定に CAPTCHA（Cloudflare Turnstile。Supabase 側の CAPTCHA はまだ無効）、使い捨てメールアドレスでの登録の拒否（Before User Created フック、有効化済み）
  - 導入ガイドに Unity の画面の画像 3 枚（`web/public/guide/`）
  - 新規登録のあと「確認メールが届かない場合」の案内。ログイン・登録のあとはトップページを開く（他のページから来たときは元のページ）
  - テンプレートのカテゴリを 5 つに整理（グッズ・パネル・ディスプレイ・看板・カフェ・バー用品・フード・ドリンク）、一覧のカテゴリの絞り込み、管理画面でカテゴリをプルダウンで変更（同期で上書きしない）
  - **サイト全体の英語版**（`/en/...`。仕組みは「4. 主な設計」の「多言語」）。管理画面は日本語のみ
  - **デザインの見直し**（Skill の frontend-design と humanizer を使用。管理画面も含む。決まりは「4. 主な設計」の「デザイン」）
  - **印刷面の大きさの表示と下絵の PNG**（エディタの印刷面ごと。下絵はプレビュー用の glb の UV から、モデルで見える範囲を白で描く。`editor/[slug]/print-guide.ts`）
  - **背景の色を消す**（エディタの印刷面ごと。縁の色に近い色を透明にする簡単な方式で、AI は使わない。ブラウザで処理して透過 PNG に差し替え、元の画像は保存しない。`editor/[slug]/background.ts`）
  - **文字を入れる**（印刷面ごとに 1 つ。価格札・お品書き・「新刊」など。画像なしでも使える。書体はゴシック（M PLUS 1p Bold）と丸ゴシック（M PLUS Rounded 1c Bold）、ライセンスは SIL OFL で `web/public/fonts`。文字は opentype.js でパスに変えて、ブラウザ（canvas）とサーバー（SVG を sharp で描く）で同じ形に描く。共通の処理は `lib/templates/text.ts`。編集内容の `text` は文字があるときだけ持つので、以前の作品の版のハッシュは変わらない）
- **サービスの選定（2026-11-12 に比較。未決）**: おすすめの構成は Vercel Pro（$20/月。Hobby は商用不可）＋ Supabase Pro（$25/月。本番用プロジェクトを東京で新しく作る）＋ Resend の無料プラン（メール送信）＋ Cloudflare（.com ドメイン・DNS・問い合わせメールの転送・Turnstile）。立ち上げ時は月 7,000 円前後。国内では さくらの AppRun 共用型（約 4,000 円〜、要 Docker 化）か Xserver / KAGOYA の VPS（保守が必要）が次点。ドメイン名・契約は利用者が決める
- 規約類の下書き: `web/content/terms.md` / `privacy.md` / `tokushoho.md`（【要確認】は未確定。共同開発者が直す予定）。英語版は `web/content/en/`（参考訳）。FAQ は `faq.md`、導入ガイドは `guide.md`（画像は `web/public/guide/`。撮り直しの手順は `web/tools/verification/README.md`。Unity の表示言語は日本語で撮影）
- 規約の日付は `web/src/lib/legal.ts`（`TERMS_VERSION` / `TERMS_DRAFT`）。文面を変えたら日付を更新する。パッケージの LICENSE.txt、登録（profiles.terms_version）、購入（payments.terms_version）に記録する
- 本番前に [production-check.md](production-check.md) の未確認の項目を確かめる。運営の手順は [admin-operations.md](admin-operations.md)
- テンプレートは `templates` ブランチで管理（`main` の変更は templates 側で `git merge main` して取り込む）

## 保留・残っている予定の作業

### A. 新規登録で電話番号の確認をし、アカウントを大量に作ってトークンを得られないようにする

**2026-11-12 に保留**（SMS の送信に費用がかかるため。登録特典は今までどおり登録時に付与する）。再開するときは送信サービス（Twilio か、国内のサービスを Send SMS フックで使うか）から決める。Supabase の資料では、ホストされたプロジェクトはテスト用の電話番号を使う場合も SMS の送信サービスの設定が必要。Phone の設定を有効にすると電話番号だけでの新規登録もできるようになるので、先に Before User Created フックで拒否する。`updateUser({ phone })` には CAPTCHA のトークンを渡せないので、Turnstile はサーバー側で検証する

- 要件は [project.md](project.md) の 6.6 の末尾と 6.11。登録特典（今は 3 トークン）は、SMS で日本の携帯電話番号を確認した時点で、1 つの番号につき 1 回だけ付与する
- 今の付与: DB のトリガー関数 `handle_new_user`（最新の定義は `20261105000000_phase8.sql`）。これを電話番号の確認後に付与する DB 関数（service_role だけが実行、二重付与防止）に移す
- 特典を受け取った番号はハッシュ値（例: 秘密の値を混ぜた HMAC）で退会後も残す。SMS ポンピング対策（日本の携帯番号に限る・CAPTCHA・送信回数の制限）。管理画面で同じ番号のアカウントをまとめて確認。規約・プライバシーポリシー・FAQ（日英）も直す
- 影響する確認: `tests/db`（登録時の付与を前提にしたテスト）、`tools/verification/e2e`（テスト用ユーザーが 3 トークンを持つ前提のもの）

### B. メールテンプレートの設定

- **残タスク（利用者）**: 日英併記にした件名と本文（`web/supabase/email-templates`）を Supabase の Authentication → Email Templates に貼り直す
- 差出人の名前とアドレスは Supabase の標準のまま。変えるには独自の SMTP（おすすめは Resend。ドメインが必要）を Authentication → SMTP Settings に設定する。Supabase 標準の送信は 1 時間に数通までなので、本番では必須

### 本番公開までの順番（2026-11-12 に整理）

1. 規約類の【要確認】の確定（共同開発者）
2. ドメイン・Supabase Pro・Vercel Pro・Resend の契約（利用者）
3. Vercel へのデプロイ（関数の地域を東京 hnd1 に）、本番用の Supabase、production-check の確認
4. 独自ドメイン・OAuth・Webhook・Turnstile の本番キー・独自 SMTP の設定
5. 本番公開 → Stripe の本番申し込み → 決済の利用開始

## 2. 構成

```
Document/            要件定義書・実装用プロンプト・この資料
index.html, models/  最初の試作（参考用。新しいアプリでは使っていない）
web/                 本体（Next.js 16 App Router + TypeScript + Tailwind v4）
  src/app/           画面と Server Actions
    editor/[slug]/   エディタ（viewer.tsx: three.js / react-three-fiber、gimmick-panel.tsx、download-panel.tsx）
      gimmick-preview/  ギミックの動きのプレビュー（preview-3d.tsx: 3D側、spec.ts: 状態とボタン、preview-overlay.tsx: 操作欄）
    works/           マイ作品（actions.ts: 保存・複製・削除、download.ts: 課金とダウンロード）
    downloads/       ダウンロード履歴と購入した版の詳細
    account/ auth/ login/ signup/ ...
  src/lib/
    templates/       テンプレート定義の型・編集内容（params）の正規化
    gimmicks/        ギミック定義の型・組み合わせの判定
    package/         unitypackage 生成（texture.ts: sharp でプリントを描く、unitypackage.ts、work-package.ts、gimmick-assets.ts）
    supabase/        クライアント（server.ts の createAdminClient は秘密キーで RLS を迂回）
  templates/<slug>/  テンプレート（template.json + .unitypackage + preview.glb + thumbnail.png）。登録手順は templates/README.md
                     テンプレートの追加・更新は `templates` ブランチで行う（サイトの改修とは別に管理）
  gimmicks/catalog/  ギミック定義（1ファイル1ギミック）。追加・編集手順は gimmicks/README.md
  gimmicks/unity/    Unity 用スクリプト（Runtime: UdonSharp、Editor: Prefab 組み立て）
  supabase/migrations/  DB の変更履歴（SQL Editor で順に実行する運用）
  scripts/           同期・サムネイル生成・プレビュー作成（template-bake/: Unity で Prefab を glb にする）のスクリプト
  tools/verification/   動作確認スクリプト（ブラウザ e2e、Unity）
```

### よく使うコマンド（web フォルダで）

```bash
npm run dev                      # 開発サーバー（http://localhost:3000）
npm run lint && npm run build    # 確認
npm run templates:prepare / templates:check / templates:sync / templates:thumbnails
npm run gimmicks:check / gimmicks:sync
npm test                         # 単体テスト（tests/unit。ネットにつながない。数秒）
npm run test:db                  # DB 関数のテスト（tests/db。.env.local の Supabase にテスト用のユーザーを作って確かめ、最後に消す）
npm run typecheck                # ルートの型を作ってから型チェック
```

- テストの対象: 版の判定と必要なトークン数（`src/lib/works/versions.ts`）、編集内容の正規化、ギミックの組み合わせ、パッケージの中身（`tests/unit`）。トークンの消費・失効・決済・返金・チャージバック・管理者の調整・退会・RLS と関数の権限（`tests/db`）
- 画面を通した確認は `web/tools/verification/e2e`（本番モードのサーバーを 3002 番で起動してから実行）。Unity での確認は [unity-import-check.md](unity-import-check.md)
- GitHub Actions（`.github/workflows/web-checks.yml`）が push のたびに lint・型チェック・単体テストを実行する（DB のテストは実行しない）

## 3. 環境

- **Supabase**: 作成済み。URL・キーは `web/.env.local`（git 管理外）。無料プラン（1週間使わないと一時停止）
- **マイグレーション**: `web/supabase/migrations` の 18 ファイルはすべて SQL Editor で実行済み（最新は `20261115000000_template_english.sql`。2026-11-13 に実行し、templates:sync で英語の名前・スロット名を登録済み）。関数を足したときは最後に `notify pgrst, 'reload schema';` を入れる（入れないと API から「関数が見つからない」になることがある）。新しく作ったら利用者に実行を依頼する（Supabase CLI・Docker は入っていない）
- **Storage バケット**: `work-images`（非公開・作品の画像とサムネイル）、`template-assets`（公開・glb とサムネイル）、`template-packages`（非公開・テンプレートの unitypackage）、`packages`（非公開・生成した unitypackage と購入した版の控え）
- **データ**: ギミック 16 件（すべて非公開）。テンプレートは unitypackage 形式で 30 件を公開（ケーキ・缶バッジ・マグカップ・タペストリー・デスクマット・うちわ・抱き枕カバー・スケートボード・本・缶・コースター・ロールバナー・チェンジングパネル・ドロップ缶・カクテルシェイカー・ダブルジガー・バーマット・サービストレイ・突き出し看板・ギャラリーパネル・カウンターカード・二つ折りパネル・道しるべ看板・吊り下げ看板・フォトスタンド・メニュースタンド・イーゼルボード・スタンド看板・フォトボード・フレームパネル）。Frame_A は印刷面が FBX 埋め込みのマテリアル（Mat_Print1・Mat_Print2）のため登録を見送り（2026-11-12 の再書き出し版も同じ。Mat_Print.mat は入っているが未使用）。フォトボードは 2026-11-12 にテクスチャを縮小した版へ更新（unitypackage 38MB → 1MB）。旧形式の Tシャツは DB の行だけ非公開で残っている（他の利用者の作品が参照）
- **Unity**: 2022.3.22f1（`C:\Program Files\Unity\Hub\Editor\2022.3.22f1`）。VCC の TestProject に UdonSharp・ClientSim あり。この PC には VRChat 本体が入っていない
- **Playwright**: web の devDependencies に入っている（サムネイル生成と確認用）
- **Stripe**: サンドボックス「VRPrintLabサンドボックス」（日本・円、カードとコンビニ決済を有効化済み）。テスト用のキー `STRIPE_SECRET_KEY`（sk_test_）と開発用の `STRIPE_WEBHOOK_SECRET` は `web/.env.local`。Stripe CLI は入っていないので、Webhook は `npm run stripe:forward` で転送する。チャージバックのテストに使ったメールアドレスは Radar が自動でブロックするので、テストのたびに新しいユーザーを使う

## 4. 主な設計（変えるときの注意）

- **課金の単位は「版」**（画面・規約では「ダウンロード内容」と呼ぶ。コードとテストの名前は「版」のまま）: 見た目の編集内容のハッシュ＝土台の版（`purchases.base_hash`）。画像は ID ではなく中身のハッシュ（`work_images.content_hash`）で計算し、以前の方式（画像 ID）のハッシュとも照合する、ギミックまで含めたハッシュ＝`params_hash`。同じ版の再ダウンロードは無料、土台が購入済みならギミックは未購入の分だけ課金、設定値の変更だけなら無料（`web/src/app/works/download.ts`）
- **トークン消費は DB 関数 `purchase_work_version`** で行う（古い順に消費、二重消費防止、service_role だけが実行可）
- **退会しても取引の記録は残す**: `payments` / `token_lots` / `token_transactions` / `purchases` は auth.users への外部キーを外してある。退会の前処理は DB 関数 `prepare_account_deletion`、退会日は `deleted_accounts`。退会後に入金された支払いは付与せず返金する
- **管理画面** `/admin` は `profiles.is_admin` の人だけ（ほかは 404）。トークンの手動調整は DB 関数 `admin_adjust_tokens`（理由必須・操作した管理者を記録）
- **トークンの有効期限は発行から 180 日**（資金決済法の前払式支払手段の届出を不要にするため。6か月未満が条件）
- **購入した版の控え**: ダウンロード時に unitypackage・編集内容・画像・サムネイルを `packages` バケットに保存。作品を編集・削除しても履歴から確認・再ダウンロードできる
- **プリントの描画**: ブラウザ（canvas）とサーバー（sharp）で同じ見た目になるよう、配置計算を `printPlacement` で共有し、明るさ・彩度は CSS フィルターと同じ式
- **テンプレート / ギミックはファイルで定義し、同期コマンドで DB に登録**。トークン数・公開状態・並び順・読み・カテゴリは登録済みなら同期で上書きしない（管理画面 /admin/catalog で変える。カテゴリの選択肢は `src/lib/templates/categories.ts`）。新しく登録したものは並びの最後に入る。テンプレート一覧は公開中のものだけ（RLS では管理者に非公開も見えるため、クエリでも絞る）。非公開のテンプレートは管理者だけがエディタで開ける
- **パッケージの名前**: フォルダ・Prefab・ファイルは `VRPrintLab_<テンプレートの slug>_<購入日時>`（`purchases.package_name` に記録。控えから作り直しても同じ名前）
- **unitypackage の GUID** は購入 ID から決定的に作る（再インポートで上書き）。共通スクリプト（`Assets/VRPrintLab/_Runtime`）は固定の GUID
- **Prefab の自動組み立て**（`VRPrintLabPrefabBuilder.cs`）
  - `EditorApplication.update` で読み込み完了を待つ（`delayCall` で自分を登録し直すと GUI の Unity が数分固まる）
  - 組み立てのたびに UdonSharp を同期コンパイルしてから設定値を書き込む
  - パッケージのマテリアルは読み込み直すと元に戻るので、発光・半透明などは作品フォルダの `Generated` に複製して使う
  - コライダーは、ルートで `Interact` を使うギミックと手に持つギミックのときだけルートに付ける（それ以外は付けない）
  - UdonSharp / VRChat SDK の型は名前で探す（入っていない環境でもコンパイルエラーにしない）。ランタイムのスクリプトは `#if UDONSHARP` で囲む
- **パッケージのスクリプト**: `_Runtime/Editor` の組み立て処理は常に入れ、`_Runtime/Scripts` は選んだギミックの分だけ入れる（`gimmickScripts`。魔法陣は VRPLSpin を使う）
- **ギミックのスクリプト**: ネットワークイベントを送るものは同期方式を `None` にしない。手で触れる判定は「手のボーン」と「手のトラッキング位置」の両方を見る（デスクトップの人は手のボーンが下に垂れている）

### 多言語（日本語・英語。2026-11-13〜）

- **URL**: 日本語は今までの URL、英語は `/en/...`。`src/proxy.ts` が `/en` を外して同じページに振り替え、表示する言語をヘッダー（`x-locale`）でページに伝える。`/ja/...` は言語なしの URL へ転送。管理画面・API・認証の受け口（`/admin` `/api` `/auth`）は言語を付けない
- **最初の言語**: 選んだ言語の Cookie（`lang`）→ アクセス元の国（Vercel の `x-vercel-ip-country`。日本なら日本語、ほかは英語）。日本語の URL に日本以外から初めて来た人は英語版へ転送する。検索エンジンとリンクのプレビューは転送しない（`src/i18n/detect.ts`）。国が分からない手元の開発環境は日本語
- **切り替え**: ヘッダーの地球のアイコンとフッター。Cookie に保存して、同じページの別の言語の URL を読み込み直す
- **検索エンジン**: ルートのレイアウトで canonical と hreflang（ja / en / x-default）を出す
- **文言**: 画面ごとの `messages.ts` に日本語と英語を並べて書く（`defineMessages`）。英語が日本語と同じ形でないと型チェックで失敗する。サーバーは `getMessages()`、ブラウザ側は `useMessages()`。リンクは `@/i18n/link`（英語なら `/en` を付ける）、転送は `localized()` / `redirectLocalized()`
- **本文**: 規約・FAQ・ガイド・お知らせは `web/content/*.md`、英語版は `web/content/en/*.md`。規約類の英語版は参考訳（日本語版が正本と各ページに表示）。未確定の箇所は英語版では【TBD …】
- **テンプレート・ギミック**: template.json の `en`（名前・説明）と各スロットの `labelEn`、ギミックの JSON の `en` が必須（check で確かめる）。テンプレートの英語の名前・説明は DB の `name_en` / `description_en`（マイグレーション `20261115000000_template_english.sql`）。カテゴリの英語名と URL 用の ID は `src/lib/templates/categories.ts`
- **記録**: 購入の記録・パッケージの中の名前は日本語のまま。英語版の画面では今のテンプレート・ギミックの英語名に置き換えて表示する。パッケージの README / LICENSE と認証メールは日英併記
- **決済**: Stripe Checkout は表示している言語で開く。英語版でも円で支払う

### デザイン（2026-11-13 に見直し）

Claude の Skill「frontend-design」（決まりきった作りに見えない UI の指針）と「humanizer」（AI っぽい英文を直す）を使って見直した。直すときもこの決まりに合わせる。

- **色**: ブランドの紺 `brand` と青緑 `accent` は変えない（利用者と相談する）。灰色は `globals.css` で zinc の値を紺寄りの色に置き換えている（`zinc-100` はサムネイルを置く台、`zinc-200` は枠線・区切り線、`zinc-600` は説明文）。クリーム色の背景は使わない
- **文字**: 書体は M PLUS 1（`next/font/google`。日本語と英語を 1 書体で。`layout.tsx`）。ページの見出しは `text-[1.75rem] font-extrabold text-brand`、節の見出しは `text-xl font-bold text-brand`
- **形**: 同じ形の白い箱（角丸＋影）を並べない。サムネイルは台の灰色に直接置き、文字は枠の外に出す。節は `Section`（上の区切り線と見出し。`components/ui.tsx`）で分ける。白い枠（`Card`）はログイン・登録のフォームだけ。角丸はボタン・入力欄 8px（`rounded-lg`）、サムネイル 12px（`rounded-xl`）、ダイアログ 16px。影はメニューとダイアログだけ
- **ボタン**: `accent`（青緑）は作る・買う・ダウンロード・登録など先へ進む操作（1 画面に 1 つ）、`primary`（紺）は保存・確定、`secondary` はそのほか
- **トンボ**（印刷の裁ち落としの目印。`.trim-marks`）: 印刷面を表す枠だけに使う（トップのグッズの台、エディタの画像を置く欄）。枠の外に 16px はみ出すので、周りに余白を取る
- **トップページ**: 右側におすすめ順の先頭 6 つのテンプレートのサムネイルを並べる（トークン数付き。押すとエディタ）
- **避けること**: 見出しの上の小さなラベル、英大文字のラベル、英語の「A · B · C」の区切りや「—」でつなぐ文、ボタンの「→」、ページを開いたときにふわっと出る動き
- **スマホ幅**: ヘッダーは 375px で 1 行に収める（スマホ幅の言語の切り替えは地球のアイコンだけ）。管理画面の表は横にスクロールする枠に入れる
- 画面の確認は日英・PC（1280px）とスマホ（375px）で撮って行う。エディタの 3D 表示（`viewer.tsx`・ギミックのプレビュー）の色や操作には手を入れていない

## 5. 残課題・既知の問題

- **決済**: Stripe（Checkout + Webhook）で実装済み（2026-11-03）。トークン画面は `/tokens`、Webhook は `/api/stripe/webhook`、DB 関数は `complete_token_payment` / `revoke_token_payment` / `expire_token_lots`。パックの価格は仮（5/12/30 トークンで 1,000/2,200/5,000 円）。1か月あたりの購入上限は利用者の判断で今回は作っていない。PayPay は後で検討
- **不正対策**: 要件定義書 6.11。電話番号の確認は「保留・残っている予定の作業」の A（保留中）。CAPTCHA（Turnstile）と使い捨てメールの拒否（Before User Created フック、有効化済み。一覧は 10,181 件を登録済み）は実装済みで、設定と運用は [admin-operations.md](admin-operations.md)。CAPTCHA は Supabase 側をまだ有効にしていない（本番の準備で設定）。管理者の権限での作成（`auth.admin.createUser`）にはフックが効かない。チャージバックのカードのブロック（`blocked_cards`）と同じカードのアカウントの表示は実装済み
- **Supabase の一時停止**: 無料プランは1週間使わないと止まる（2026-10-27 に停止、利用者が再開）。止まると templates:sync やサイト全体が `fetch failed` になる
- **認証メール**: 「保留・残っている予定の作業」の B。**残タスク: 日英併記にした件名と本文（`web/supabase/email-templates`、2026-11-13 更新）を Supabase の Authentication → Email Templates に貼り直す（利用者が行う）**。今のダッシュボードは日本語だけの古い文面のまま
- **未決事項**: トークンの価格・各テンプレート/ギミックの消費量、ドメイン、SMS の送信サービス
- **集計の新規登録**: 今も登録中の人数（あとで退会した人は登録月の数から外れる。`deleted_accounts` に登録日がないため）
- **確認スクリプトの注意**（2026-11-13）
  - 管理画面の URL・文字を管理者以外に届けない（`admin-link-check` で確かめる）: 「管理画面」の文言はサーバーだけで読む `components/admin-nav-messages.ts`、管理画面に言語を付けない判定は `proxy.ts` の `isAdminPath`。ブラウザでも読み込む `i18n/config.ts` や共通の文言（`components/messages.ts`）に管理画面の URL・文字を書かない
  - `gimmick-e2e` は、確認の間だけ全ギミックを公開し、最後に元の公開状態に戻す（今は 16 件すべて非公開）
  - 画面の要素は、見た目のクラス名ではなく文言・ラベル・`data-*` 属性（`data-download-panel`、`data-gimmick-item`、`data-template`）で探す
- **確認スクリプトの起動**: 本番モードのサーバーを `npx next start -p 3002` で起動する。止めるときは node の `next start` のプロセスを止める（ポートの一覧からは見つからないことがある）
- **テンプレート（unitypackage 形式）**: 購入時はテンプレートの中身を作品フォルダの `Template/` に複製し、GUID を振り直してスロットの .mat の色・テクスチャだけを書き換える。プレビューの glb は `templates:prepare` が Unity のバッチモードで Prefab から作る（登録する PC に Unity 2022.3 が必要）。エディタの最初の視点は、1つ目のプリント面の UV の中心を正面から見る向き（`src/lib/templates/view.ts`）。ケーキは 6.7 万・缶は 1.32 万・スケートボードは 1.06 万三角形で Quest の目安（1万）を超えている。チェンジングパネル（`angle-fold`）は短冊が 45 度なので、`aspect` 1.03 は斜めから見たときの比。本はエディタのプレビューで、表紙のプリントの上に背の溝が細かい点で透ける（Unity では出ない）
- **ギミック**: VRChat 上での全員への同期は未確認。直近の修正版（光る・触れる・振る）は利用者の Unity での再確認待ち
- **利用者の TestProject**: G01 の Prefab からオブジェクトが消えていた。修正版パッケージを読み込み、Tools > VRPrintLab > Prefab をすべて作り直す で復旧する手順を案内済み
- **本番公開**: Vercel へのデプロイ、ドメイン、確認メールの送信サービス（Supabase 標準は 1 時間に数通まで）、Supabase の有料プラン検討
- **共同開発者のブランチ**: `add-cake-model` は不要（利用者が判断）。ローカルのブランチは削除済み、GitHub 上のブランチは利用者の指示で残している
- **画像の保存・削除**（2026-11-03 に見直し）: ログイン前の下書きは引き継ぎ期限 24 時間で、期限切れはエディタを開いたときに消す。Storage の削除は `storage_deletions` に記録してから行い、失敗分は Vercel Cron（`vercel.json`、要 `CRON_SECRET`）か `/admin` から再試行する。控えはダウンロード履歴から版ごとに削除できる。表示用の署名付き URL は有効期限内（画像1時間・ダウンロード5分）なら誰でも取得できる
- **git 履歴**: 公開リポジトリの過去の履歴に `.vs/` フォルダ（PC のユーザー名を含むパス）とコミットのメールアドレスが残っている。利用者は今回は対応しない判断

## 6. 作業ルール（利用者の指示）

- 返答・報告・コミットメッセージは日本語
- 作業ごとにブランチを作る。新しい作業は、直前の作業ブランチを `main` に早送りマージしてから始める
- コミットメッセージは「1 行目に要約、空行、変更点を `- ` の箇条書き」。`Co-Authored-By` などの帰属表記は入れない
- push はしない（指示があるまで）。利用者がコミットを不要と言ったファイルはコミットしない
- テンプレートの追加・更新は `templates` ブランチで行う（システムの改修は `feature/...` ブランチから main へ）
- 利用者の Supabase に影響する SQL は、ファイルを作って利用者に SQL Editor で実行してもらう
- 画面の変更はブラウザで、Unity 側の変更は GUI の Unity（TestProject のコピー）で動作を確認してから報告する
- **サイトの更新は日本語と英語の両方に行う**（2026-11-13 に利用者が指示）。画面の文言・規約類・FAQ・ガイド・お知らせ・テンプレートやギミックの表示名・認証メール・パッケージの README / LICENSE が対象。管理画面は日本語のみ
