# 引継ぎ資料（2026-10-05 時点）

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
| 7 | トークン購入・有効期限切れの記録 | **未着手**（決済は Stripe に決定。規約類と本番公開を先に行う） |
| 8 | 導入ガイド・規約類・通報・管理画面 | 未着手 |
| 9 | テストの整備 | 未着手（確認用スクリプトは `web/tools/verification` にある） |

- サービス名は **VRPrintLab**（ロゴ・ファビコンは `web/images/common`）。リポジトリ名・フォルダ名は VRC-DressDrop のまま
- `main` に全フェーズの成果をマージ済み。push はしていない（リモートより先行している）

## 2. 構成

```
Document/            要件定義書・実装用プロンプト・この資料
index.html, models/  最初の試作（参考用。新しいアプリでは使っていない）
web/                 本体（Next.js 16 App Router + TypeScript + Tailwind v4）
  src/app/           画面と Server Actions
    editor/[slug]/   エディタ（viewer.tsx: three.js / react-three-fiber、gimmick-panel.tsx、download-panel.tsx）
    works/           マイ作品（actions.ts: 保存・複製・削除、download.ts: 課金とダウンロード）
    downloads/       ダウンロード履歴と購入した版の詳細
    account/ auth/ login/ signup/ ...
  src/lib/
    templates/       テンプレート定義の型・編集内容（params）の正規化
    gimmicks/        ギミック定義の型・組み合わせの判定
    package/         unitypackage 生成（texture.ts: sharp でプリントを描く、unitypackage.ts、work-package.ts、gimmick-assets.ts）
    supabase/        クライアント（server.ts の createAdminClient は秘密キーで RLS を迂回）
  templates/<slug>/  テンプレート（template.json + model.glb + model.fbx + thumbnail.png）。追加手順は templates/README.md
  gimmicks/catalog/  ギミック定義（1ファイル1ギミック）。追加・編集手順は gimmicks/README.md
  gimmicks/unity/    Unity 用スクリプト（Runtime: UdonSharp、Editor: Prefab 組み立て）
  supabase/migrations/  DB の変更履歴（SQL Editor で順に実行する運用）
  scripts/           同期・サムネイル生成のスクリプト
  tools/verification/   動作確認スクリプト（ブラウザ e2e、Unity）
```

### よく使うコマンド（web フォルダで）

```bash
npm run dev                      # 開発サーバー（http://localhost:3000）
npm run lint && npm run build    # 確認
npm run templates:check / templates:sync / templates:thumbnails
npm run gimmicks:check / gimmicks:sync
```

## 3. 環境

- **Supabase**: 作成済み。URL・キーは `web/.env.local`（git 管理外）。無料プラン（1週間使わないと一時停止）
- **マイグレーション**: `web/supabase/migrations` の 7 ファイルはすべて SQL Editor で実行済み。新しく作ったら利用者に実行を依頼する（Supabase CLI・Docker は入っていない）
- **Storage バケット**: `work-images`（非公開・作品の画像とサムネイル）、`template-assets`（公開・glb とサムネイル）、`template-packages`（非公開・同梱用 fbx）、`packages`（非公開・生成した unitypackage と購入した版の控え）
- **データ**: テンプレートは Tシャツ 1 件、ギミック 16 件を登録済み
- **Unity**: 2022.3.22f1（`C:\Program Files\Unity\Hub\Editor\2022.3.22f1`）。VCC の TestProject に UdonSharp・ClientSim あり。この PC には VRChat 本体が入っていない
- **Playwright**: web の devDependencies に入っている（サムネイル生成と確認用）

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

- **決済**: Stripe（Checkout + Webhook）に決定（2026-10-05）。カードとコンビニ払いから始め、PayPay は後で検討。返金・チャージバック・購入上限の方針は要件定義書 6.8・8章を参照
- **不正対策**: 要件定義書 6.11 を追加（2026-10-05）。今の実装は新規登録の時点で3トークンを付与しているため、SMS で電話番号を確認した時点の付与に変える必要がある。CAPTCHA・使い捨てメールの拒否・カードのブロックも未実装
- **トークンの有効期限切れ**: 残高計算では期限切れを除外しているが、履歴に「失効」を記録する処理は未実装（Phase 7）
- **未決事項**: トークンの価格・各テンプレート/ギミックの消費量、ドメイン、Tシャツ以外のテンプレートのモデル
- **Tシャツのモデル**: 背中の襟元にプリントの小さな複製が出る（背中側の一部の面に Mat_Print が割り当たっている）、プリント範囲の端に陰影の線、FBX 内に作者 PC のユーザー名を含むパス（販売物に同梱される。利用者は今回は対応しない判断）
- **ギミック**: VRChat 上での全員への同期は未確認。直近の修正版（光る・触れる・振る）は利用者の Unity での再確認待ち
- **利用者の TestProject**: G01 の Prefab からオブジェクトが消えていた。修正版パッケージを読み込み、Tools > VRPrintLab > Prefab をすべて作り直す で復旧する手順を案内済み
- **本番公開**: Vercel へのデプロイ、ドメイン、確認メールの送信サービス（Supabase 標準は 1 時間に数通まで）、Supabase の有料プラン検討
- **git 履歴**: 公開リポジトリの過去の履歴に `.vs/` フォルダ（PC のユーザー名を含むパス）とコミットのメールアドレスが残っている。利用者は今回は対応しない判断

## 6. 作業ルール（利用者の指示）

- 返答・報告・コミットメッセージは日本語
- 作業ごとにブランチを作る。新しい作業は、直前の作業ブランチを `main` に早送りマージしてから始める
- コミットメッセージは「1 行目に要約、空行、変更点を `- ` の箇条書き」。`Co-Authored-By` などの帰属表記は入れない
- push はしない（指示があるまで）
- 利用者の Supabase に影響する SQL は、ファイルを作って利用者に SQL Editor で実行してもらう
- 画面の変更はブラウザで、Unity 側の変更は GUI の Unity（TestProject のコピー）で動作を確認してから報告する
