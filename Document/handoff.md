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
| 8 | 導入ガイド・規約類・通報・管理画面 | 未着手 |
| 9 | テストの整備 | 未着手（確認用スクリプトは `web/tools/verification` にある） |

- サービス名は **VRPrintLab**（ロゴ・ファビコンは `web/images/common`）。リポジトリ名・フォルダ名は VRC-DressDrop のまま
- `main` に Phase 1〜7 の成果をマージ済み。main（`dbca055`）と templates（`d494640`）は利用者が push 済みで、GitHub と一致している（2026-11-03）
- **次の作業は Phase 8**（規約類・導入ガイド・通報・管理画面）。規約類は共同開発者が作成中。規約に書ける内容の確認結果を `Document/implementation-check-for-terms.txt`（git 管理外・利用者の指示でコミットしない）にまとめて渡した
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
```

## 3. 環境

- **Supabase**: 作成済み。URL・キーは `web/.env.local`（git 管理外）。無料プラン（1週間使わないと一時停止）
- **マイグレーション**: `web/supabase/migrations` の 9 ファイルはすべて SQL Editor で実行済み（最新は `20261103000000_stripe_payments.sql`）。新しく作ったら利用者に実行を依頼する（Supabase CLI・Docker は入っていない）
- **Storage バケット**: `work-images`（非公開・作品の画像とサムネイル）、`template-assets`（公開・glb とサムネイル）、`template-packages`（非公開・テンプレートの unitypackage）、`packages`（非公開・生成した unitypackage と購入した版の控え）
- **データ**: ギミック 16 件。テンプレートは unitypackage 形式で 8 件を公開（ケーキ・缶バッジ・マグカップ・タペストリー・デスクマット・うちわ・抱き枕カバー・スケートボード）。旧形式の Tシャツは DB の行だけ非公開で残っている（他の利用者の作品が参照）
- **Unity**: 2022.3.22f1（`C:\Program Files\Unity\Hub\Editor\2022.3.22f1`）。VCC の TestProject に UdonSharp・ClientSim あり。この PC には VRChat 本体が入っていない
- **Playwright**: web の devDependencies に入っている（サムネイル生成と確認用）
- **Stripe**: サンドボックス「VRPrintLabサンドボックス」（日本・円、カードとコンビニ決済を有効化済み）。テスト用のキー `STRIPE_SECRET_KEY`（sk_test_）と開発用の `STRIPE_WEBHOOK_SECRET` は `web/.env.local`。Stripe CLI は入っていないので、Webhook は `npm run stripe:forward` で転送する。チャージバックのテストに使ったメールアドレスは Radar が自動でブロックするので、テストのたびに新しいユーザーを使う

## 4. 主な設計（変えるときの注意）

- **課金の単位は「版」**: 見た目の編集内容（画像 ID を含む）のハッシュ＝土台の版（`purchases.base_hash`）、ギミックまで含めたハッシュ＝`params_hash`。同じ版の再ダウンロードは無料、土台が購入済みならギミックは未購入の分だけ課金、設定値の変更だけなら無料（`web/src/app/works/download.ts`）
- **トークン消費は DB 関数 `purchase_work_version`** で行う（古い順に消費、二重消費防止、service_role だけが実行可）
- **トークンの有効期限は発行から 180 日**（資金決済法の前払式支払手段の届出を不要にするため。6か月未満が条件）
- **購入した版の控え**: ダウンロード時に unitypackage・編集内容・画像・サムネイルを `packages` バケットに保存。作品を編集・削除しても履歴から確認・再ダウンロードできる
- **プリントの描画**: ブラウザ（canvas）とサーバー（sharp）で同じ見た目になるよう、配置計算を `printPlacement` で共有し、明るさ・彩度は CSS フィルターと同じ式
- **テンプレート / ギミックはファイルで定義し、同期コマンドで DB に登録**。トークン数・公開状態は DB の列が優先（管理画面から変えられるように）
- **unitypackage の GUID** は購入 ID から決定的に作る（再インポートで上書き）。共通スクリプト（`Assets/VRPrintLab/_Runtime`）は固定の GUID
- **Prefab の自動組み立て**（`VRPrintLabPrefabBuilder.cs`）
  - `EditorApplication.update` で読み込み完了を待つ（`delayCall` で自分を登録し直すと GUI の Unity が数分固まる）
  - 組み立てのたびに UdonSharp を同期コンパイルしてから設定値を書き込む
  - パッケージのマテリアルは読み込み直すと元に戻るので、発光・半透明などは作品フォルダの `Generated` に複製して使う
  - UdonSharp / VRChat SDK の型は名前で探す（入っていない環境でもコンパイルエラーにしない）。ランタイムのスクリプトは `#if UDONSHARP` で囲む
- **ギミックのスクリプト**: ネットワークイベントを送るものは同期方式を `None` にしない。手で触れる判定は「手のボーン」と「手のトラッキング位置」の両方を見る（デスクトップの人は手のボーンが下に垂れている）

## 5. 残課題・既知の問題

- **決済**: Stripe（Checkout + Webhook）で実装済み（2026-11-03）。トークン画面は `/tokens`、Webhook は `/api/stripe/webhook`、DB 関数は `complete_token_payment` / `revoke_token_payment` / `expire_token_lots`。パックの価格は仮（5/12/30 トークンで 1,000/2,200/5,000 円）。1か月あたりの購入上限は利用者の判断で今回は作っていない。PayPay は後で検討
- **不正対策**: 要件定義書 6.11 を追加（2026-10-05）。今の実装は新規登録の時点で3トークンを付与しているため、SMS で電話番号を確認した時点の付与に変える必要がある。CAPTCHA・使い捨てメールの拒否・カードのブロックも未実装
- **Supabase の一時停止**: 無料プランは1週間使わないと止まる（2026-10-27 に停止、利用者が再開）。止まると templates:sync やサイト全体が `fetch failed` になる
- **未決事項**: トークンの価格・各テンプレート/ギミックの消費量、ドメイン
- **テンプレート（unitypackage 形式）**: 購入時はテンプレートの中身を作品フォルダの `Template/` に複製し、GUID を振り直してスロットの .mat の色・テクスチャだけを書き換える。プレビューの glb は `templates:prepare` が Unity のバッチモードで Prefab から作る（登録する PC に Unity 2022.3 が必要）。エディタの最初の視点は、1つ目のプリント面の UV の中心を正面から見る向き（`src/lib/templates/view.ts`）。ケーキは 6.7 万・スケートボードは 1.06 万三角形で Quest の目安（1万）を超えている。スケートボードは templates:prepare で「UV が裏返っている」注意が出るが、利用者が問題なしと判断して公開
- **ギミック**: VRChat 上での全員への同期は未確認。直近の修正版（光る・触れる・振る）は利用者の Unity での再確認待ち
- **利用者の TestProject**: G01 の Prefab からオブジェクトが消えていた。修正版パッケージを読み込み、Tools > VRPrintLab > Prefab をすべて作り直す で復旧する手順を案内済み
- **本番公開**: Vercel へのデプロイ、ドメイン、確認メールの送信サービス（Supabase 標準は 1 時間に数通まで）、Supabase の有料プラン検討
- **共同開発者のブランチ**: `add-cake-model` は不要（利用者が判断）。ローカルのブランチは削除済み、GitHub 上のブランチは利用者の指示で残している
- **画像の保存・削除（規約の確認で分かったこと）**: ログイン前の下書き（IndexedDB）は自動では削除されない。作品の削除で画像の削除に失敗しても再試行しない。購入した版の控え（元画像のコピーを含む）は退会まで残り、版ごとに削除する機能や管理画面からの削除はない。表示用の署名付き URL は有効期限内（画像1時間・ダウンロード5分）なら誰でも取得できる
- **git 履歴**: 公開リポジトリの過去の履歴に `.vs/` フォルダ（PC のユーザー名を含むパス）とコミットのメールアドレスが残っている。利用者は今回は対応しない判断

## 6. 作業ルール（利用者の指示）

- 返答・報告・コミットメッセージは日本語
- 作業ごとにブランチを作る。新しい作業は、直前の作業ブランチを `main` に早送りマージしてから始める
- コミットメッセージは「1 行目に要約、空行、変更点を `- ` の箇条書き」。`Co-Authored-By` などの帰属表記は入れない
- push はしない（指示があるまで）。利用者がコミットを不要と言ったファイルはコミットしない
- テンプレートの追加・更新は `templates` ブランチで行う（システムの改修は `feature/...` ブランチから main へ）
- 利用者の Supabase に影響する SQL は、ファイルを作って利用者に SQL Editor で実行してもらう
- 画面の変更はブラウザで、Unity 側の変更は GUI の Unity（TestProject のコピー）で動作を確認してから報告する
