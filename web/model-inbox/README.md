# AIなしでモデルを追加する手順

ここは **未登録モデルの準備場所**。入れるだけではアップロードされません。
登録対象は別の `web/templates/<商品ID>` です。

## 1. 原本を保管する

商品別フォルダの source に .blend や .unitypackage を置きます。
cake / mug / uchiwa / body-pillow / tapestry / tumbler / skateboard / ita-bag を用意しました。
新しい種類は英小文字の商品IDでフォルダを作れます。

原本・準備中のモデル/画像・下書き設定は、このフォルダの.gitignoreでGit対象外です。
他のPCにも必要な原本は別途バックアップしてください。
完成した登録用ファイルは templates 側へコピーしてGitで共有します。

**UnityPackageを置くだけで自動変換する機能はありません。**
Prefabのサイズ変更・マテリアル差し替え・パーティクル・スクリプトはFBXに入っていないことがあります。
可能なら制作元のBlenderファイルから書き出す方が簡単です。
他人のモデルは、このサービスで加工・配布できる利用条件か確認してください。

## 2. Blenderでモデルを準備する

1. 本体色とプリント面を別マテリアルにします。
   例: Mat_Base（本体）、Mat_Print（表）、Mat_Print_2（裏）。
   「オブジェクト名」ではなく「マテリアル名」です。
2. プリント面のUVを0〜1に展開。上下左右のある見本画像で向きを確認。
3. 表裏に別々の画像を使いたい場合は、表裏のマテリアルも別にします。
4. 同じモデル・同じマテリアル名・同じUVで model.glb と model.fbx を書き出します。
5. 撮影用カメラ・照明・床を除外し、モデルのみを書き出します。

複雑なBlenderノードやUnity専用シェーダーは、そのままWebへ移せません。
配布処理は設定されたスロット用のマテリアルを生成する方式で、
元Prefabの質感・発光・透明設定などを自動的にすべて引き継ぐわけではありません。
ケーキ・車・飛行機など多素材のものはWebとUnityを比較してください。

## 3. 設定ファイルを作る

**START.cmdをダブルクリック**。Node.jsがあれば追加インストール不要。
通信しないローカルツールなので、AIの利用枠は使いません。

商品ID・表示名・マテリアル名・プリント面数・縦横比に答えます。
確認で y を入力すると <商品ID>/template.json ができます。初期状態は非公開です。
既存の設定は上書きしません。修正はVS CodeでJSONを開いて行います。
モデルの改名・変換・UV展開はこのツールでは行いません。

縦横比は「プリント範囲の幅÷高さ」。円柱の一周印刷なら「円周÷印刷高さ」。
複数の色変更スロットが必要な場合はJSONに手動で追加してください。
本体色を「なし」にするとプリント余白は透明になります。
穴を開けたくない面では本体色を指定してください。

用意するファイル:
- model-inbox/mug/source/ : 原本（登録しない）
- model-inbox/mug/template.json : 設定
- model-inbox/mug/model.glb : Webプレビュー
- model-inbox/mug/model.fbx : Unity配布モデル
- model-inbox/mug/thumbnail.png : 任意、4:3推奨

## 4. 完成品だけコピー・検証する

GitHub DesktopでFetch origin、必要ならPull originしてから作業してください。
エクスプローラーで web/templates/mug を新規作成します。
template.json・model.glb・model.fbx・任意のthumbnail.pngだけコピーします。
sourceはコピーしません。同名の商品がある場合は更新になるので友達に確認します。

VS Codeのターミナルで:

```powershell
cd C:\Users\Masaya\Documents\GitHub\RingFitShooting\VRC-DressDrop\web
npm.cmd run templates:check -- mug
```

mugは実際の商品IDに置き換えます。検証はアップロードしません。
エラーを直してから先へ進みます。
三角形1万超はこのプロジェクトの目安の警告で、VRChat全用途の絶対上限ではありません。
検証OKでも実寸・UVの見た目・元Prefabとの一致までは保証しません。

サムネイルを自動生成したい場合だけ（自作thumbnail.pngがあれば不要）:

```powershell
npx.cmd playwright install chromium
npm.cmd run templates:thumbnails -- mug
```

最初のコマンドはブラウザーをダウンロードします。初回のみ必要です。

## 5. 非公開登録する

**ここから共有Supabaseのデータを書き換えます。接続先・費用設定を友達と確認してください。**
web/.env.localで指定したプロジェクトへ登録されます。
開発用と本番が同じ接続先なら、本番にも影響します。

必要な設定名:
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SECRET_KEY（サーバー専用。公開用キーとは別）

秘密キーはチャットやGitHubに貼らないでください。

```powershell
npm.cmd run templates:sync -- mug
```

商品IDを省略すると全テンプレートを登録・更新します。必ずIDを付けてください。
同じIDは更新になります。非公開でも素材はサーバーに送信されます。
非公開設定を秘密データの保管手段にはしないでください。

## 6. 確認して公開する

```powershell
npm.cmd run dev
```

既に開発サーバーが動いていれば、重ねて起動する必要はありません。
管理者アカウントで http://localhost:3000/editor/mug を開いて確認します。
非公開で404になる場合は、そのアカウントが管理者か友達に確認します。
ダウンロードしたUnityPackageをUnityでも確認してください。

OKなら **web/templates/mug/template.json** の isPublic を true にして、
同じ templates:sync -- mug を再実行。準備フォルダの設定も揃えます。
GitHub Desktopで完成品をコミット・プッシュして友達に共有します。
GitHubへのプッシュと、Supabaseへの登録は別の操作です。

## よくある問題

- package.jsonがない: ターミナルをwebフォルダへ移動する。
- materialがない: JSONとGLB/FBXのマテリアル名を合わせる。
- UVがない: BlenderでUV展開して再出力する。
- 画像が伸びる: aspectとUVを見直す。
- 印刷面に穴が開く: backgroundを透明から本体色スロットへ変更する。
- キーのエラー: 開発仲間にサーバー専用キーの設定を確認。キー自体を公開しない。
- Unityで色/サイズが違う: 元Prefabだけの設定がFBXに反映されていない可能性。

詳細仕様は ../templates/README.md を参照してください。
