# 引継ぎ資料（2026-11-03 時点）

次のチャット（または別の担当者）が作業を続けるための資料です。要件は [project.md](project.md)、実装の進め方は [build-prompt.md](build-prompt.md) を参照してください。

## 1. 現在地

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | Next.js + Supabase の雛形、DB スキーマ・RLS | 完了 |
| 2 | ログイン（メール / Google / Discord）、新規登録で 3 トークン付与 | 完了（Google / Discord の OAuth 設定は未確認） |
| 3 | テンプレート一覧・エディタ（3D プレビュー、画像・色・拡大縮小・位置・回転・明るさ・彩度、元に戻す） | 完了 |
| 4 | 作品の保存・再編集・マイ作品、ログイン前の編集内容の引き継ぎ | 完了 |
| 5 | unitypackage のサーバー生成、トークン消費、購入済みの版の再ダウンロード、ダウンロード履歴 | 完了 |
| 6 | ギミック 16 種、Prefab の自動組み立て、ギミック追加分だけの課金 | 完了（VRChat 上での同期は未確認） |
| 7 | トークン購入・有効期限切れの記録 | 完了（Stripe のテスト環境で確認済み。本番の利用開始は規約類の公開と本番公開のあと。設定は [stripe-setup.md](stripe-setup.md)） |
| 8 | 導入ガイド・規約類・通報・管理画面 | 完了（`feature/phase8-legal-guide-admin`、未マージ。2026-11-03 に確認スクリプトで確認済み）。規約類の文面は確認用の下書き、導入ガイドの画像は未作成 |
| 9 | テストの整備 | 完了（`feature/phase9-tests`、未マージ）。単体テスト 60 件・DB 関数のテスト 33 件・Unity の手動確認の手順書・GitHub Actions |

- サービス名は **VRPrintLab**（ロゴ・ファビコンは `web/images/common`）。リポジトリ名・フォルダ名は VRC-DressDrop のまま
- `main` に Phase 1〜7 の成果をマージ済み。main（`dbca055`）と templates（`d494640`）は利用者が push 済みで、GitHub と一致している（2026-11-03）
- **Phase 8**（`feature/phase8-legal-guide-admin`）。`feature/terms-and-data-handling` は main にマージ済み（2026-11-03）
  - 規約類の下書き: `web/content/terms.md` / `privacy.md` / `tokushoho.md`（【要確認】は未確定。共同開発者が直す予定）。FAQ は `faq.md`、導入ガイドは `guide.md`（画像は「画像準備中」の枠。`![説明](/パス)` に差し替える）
  - 規約の版は `web/src/lib/legal.ts`（`TERMS_VERSION` / `TERMS_DRAFT`）。パッケージの LICENSE.txt、登録（profiles.terms_version）、購入（payments.terms_version）に記録する
  - 通報の機能は 2026-11-07 に利用者の判断で削除した（`reports` テーブルも `20261107000000_drop_reports.sql` で削除）。管理画面は ユーザー・テンプレート/ギミックの設定・集計（同じカードのアカウントを含む）
  - マイグレーション `20261105000000_phase8.sql` は実行済み。確認は `tools/verification/e2e/phase8-e2e.cjs` と `admin-link-check.cjs`（ヘッダーの「管理画面」は管理者にだけ届く）
  - 本番前に [production-check.md](production-check.md) の未確認の項目を確かめる。運営の手順は [admin-operations.md](admin-operations.md)
- テンプレートは `templates` ブランチで管理（`main` の変更は templates 側で `git merge main` して取り込む）

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
- **マイグレーション**: `web/supabase/migrations` の 13 ファイルはすべて SQL Editor で実行済み（最新は `20261108000000_purchase_package_name.sql`）。新しく作ったら利用者に実行を依頼する（Supabase CLI・Docker は入っていない）
- **Storage バケット**: `work-images`（非公開・作品の画像とサムネイル）、`template-assets`（公開・glb とサムネイル）、`template-packages`（非公開・テンプレートの unitypackage）、`packages`（非公開・生成した unitypackage と購入した版の控え）
- **データ**: ギミック 16 件。テンプレートは unitypackage 形式で 17 件を公開（ケーキ・缶バッジ・マグカップ・タペストリー・デスクマット・うちわ・抱き枕カバー・スケートボード・本・缶・コースター・ロールバナー・チェンジングパネル・ドロップ缶・カクテルシェイカー・ダブルジガー・バーマット）。旧形式の Tシャツは DB の行だけ非公開で残っている（他の利用者の作品が参照）
- **Unity**: 2022.3.22f1（`C:\Program Files\Unity\Hub\Editor\2022.3.22f1`）。VCC の TestProject に UdonSharp・ClientSim あり。この PC には VRChat 本体が入っていない
- **Playwright**: web の devDependencies に入っている（サムネイル生成と確認用）
- **Stripe**: サンドボックス「VRPrintLabサンドボックス」（日本・円、カードとコンビニ決済を有効化済み）。テスト用のキー `STRIPE_SECRET_KEY`（sk_test_）と開発用の `STRIPE_WEBHOOK_SECRET` は `web/.env.local`。Stripe CLI は入っていないので、Webhook は `npm run stripe:forward` で転送する。チャージバックのテストに使ったメールアドレスは Radar が自動でブロックするので、テストのたびに新しいユーザーを使う

## 4. 主な設計（変えるときの注意）

- **課金の単位は「版」**: 見た目の編集内容のハッシュ＝土台の版（`purchases.base_hash`）。画像は ID ではなく中身のハッシュ（`work_images.content_hash`）で計算し、以前の方式（画像 ID）のハッシュとも照合する、ギミックまで含めたハッシュ＝`params_hash`。同じ版の再ダウンロードは無料、土台が購入済みならギミックは未購入の分だけ課金、設定値の変更だけなら無料（`web/src/app/works/download.ts`）
- **トークン消費は DB 関数 `purchase_work_version`** で行う（古い順に消費、二重消費防止、service_role だけが実行可）
- **退会しても取引の記録は残す**: `payments` / `token_lots` / `token_transactions` / `purchases` は auth.users への外部キーを外してある。退会の前処理は DB 関数 `prepare_account_deletion`、退会日は `deleted_accounts`。退会後に入金された支払いは付与せず返金する
- **管理画面** `/admin` は `profiles.is_admin` の人だけ（ほかは 404）。トークンの手動調整は DB 関数 `admin_adjust_tokens`（理由必須・操作した管理者を記録）
- **トークンの有効期限は発行から 180 日**（資金決済法の前払式支払手段の届出を不要にするため。6か月未満が条件）
- **購入した版の控え**: ダウンロード時に unitypackage・編集内容・画像・サムネイルを `packages` バケットに保存。作品を編集・削除しても履歴から確認・再ダウンロードできる
- **プリントの描画**: ブラウザ（canvas）とサーバー（sharp）で同じ見た目になるよう、配置計算を `printPlacement` で共有し、明るさ・彩度は CSS フィルターと同じ式
- **テンプレート / ギミックはファイルで定義し、同期コマンドで DB に登録**。トークン数・公開状態は登録済みなら同期で上書きしない（管理画面 /admin/catalog で変える。2026-11-03 に同期スクリプトを修正）。テンプレート一覧は公開中のものだけ（RLS では管理者に非公開も見えるため、クエリでも絞る）。非公開のテンプレートは管理者だけがエディタで開ける
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

## 5. 残課題・既知の問題

- **決済**: Stripe（Checkout + Webhook）で実装済み（2026-11-03）。トークン画面は `/tokens`、Webhook は `/api/stripe/webhook`、DB 関数は `complete_token_payment` / `revoke_token_payment` / `expire_token_lots`。パックの価格は仮（5/12/30 トークンで 1,000/2,200/5,000 円）。1か月あたりの購入上限は利用者の判断で今回は作っていない。PayPay は後で検討
- **不正対策**: 要件定義書 6.11 を追加（2026-10-05）。今の実装は新規登録の時点で3トークンを付与しているため、SMS で電話番号を確認した時点の付与に変える必要がある。CAPTCHA・使い捨てメールの拒否・カードのブロックも未実装
- **Supabase の一時停止**: 無料プランは1週間使わないと止まる（2026-10-27 に停止、利用者が再開）。止まると templates:sync やサイト全体が `fetch failed` になる
- **認証メール**: 文面は `web/supabase/email-templates`（Supabase のダッシュボードに貼り付けて反映）。差出人は Supabase の標準のままなので、本番では独自ドメインの SMTP を設定する
- **未決事項**: トークンの価格・各テンプレート/ギミックの消費量、ドメイン
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
