# 動作確認用スクリプト

画面を通した確認（ブラウザ）と、Unity での確認に使うスクリプトです。
処理ごとの自動テストは `web/tests` にあります（`npm test` は単体テスト、`npm run test:db` は DB 関数のテスト）。
Unity での手動確認の手順と記録表は `Document/unity-import-check.md` にあります。
いずれも **テスト用ユーザーを作って最後に削除** します（退会後も残る記録の表も `e2e/cleanup.cjs` で消す）。Supabase は `.env.local` の本番プロジェクトを使うので注意してください。

## ブラウザでの通し確認（e2e/）

事前に本番モードのサーバーを起動しておきます。

```bash
cd web
npm run build
npx next start -p 3002
```

別のターミナルで（`web` フォルダから実行）:

```bash
node --env-file=.env.local tools/verification/e2e/works-e2e.cjs     # 保存・再編集・マイ作品・ログイン前の編集の引き継ぎ
node --env-file=.env.local tools/verification/e2e/download-e2e.cjs  # ダウンロード・トークン消費・再ダウンロード・履歴
node --env-file=.env.local tools/verification/e2e/versions-e2e.cjs  # 数値入力・前回の内容を残す確認・履歴の詳細
node --env-file=.env.local tools/verification/e2e/gimmick-e2e.cjs   # ギミックの選択・内訳・差額の課金（確認の間だけ全ギミックを公開し、最後に元に戻す）
node --env-file=.env.local tools/verification/e2e/data-handling-e2e.cjs  # 下書きの期限・LICENSE.txt・同じ画像の貼り直し・控えの削除・作品の削除・管理画面・退会
node --env-file=.env.local tools/verification/e2e/phase8-e2e.cjs         # 非公開テンプレート・規約類のページ・管理画面での停止と設定・集計
node --env-file=.env.local tools/verification/e2e/tab-return-check.cjs   # 管理画面で変えたトークン数が、開いたままのタブにも反映される
node --env-file=.env.local tools/verification/e2e/catalog-order-check.cjs  # 管理画面の並べ替えが一覧に反映される・一覧の並べ替えと検索
node tools/verification/e2e/orbit-center-check.cjs                       # 読み込み直後に操作しても、エディタのモデルが中心で回る
node --env-file=.env.local tools/verification/e2e/admin-link-check.cjs   # ヘッダーの「管理画面」が管理者にだけ届く（HTML・JavaScript・RSC に含まれない）
node --env-file=.env.local tools/verification/e2e/admin-nav-check.cjs    # 管理画面のタブで、開いているページのタブが選択中になる
node --env-file=.env.local tools/verification/e2e/admin-stats-detail-check.cjs  # 集計の月の詳細（新規登録・支払い・ダウンロードの一覧と内訳、50 件ずつ）
node --env-file=.env.local tools/verification/e2e/acrylic-shape-check.cjs  # アクリルスタンドの形（切り抜き・四角）と厚み、日英・スマホ幅、ダウンロードした側面のメッシュ（BASE_URL でサーバーを変えられる）
node tools/verification/e2e/home-upload-check.cjs                          # トップページで画像を選ぶと、その画像を貼ったアクリルスタンドのエディタが開く（日英・スマホ幅。BASE_URL でサーバーを変えられる）
```

スクリーンショットは `tools/verification/e2e/shots/`（`SHOTS_DIR` で変更可）に保存されます。
3D 表示のためヘッドレス Chromium を SwiftShader で起動しています（初回は `npx playwright install chromium`）。

## Unity での確認（unity/）

Unity 2022.3.22f1 と、VCC の TestProject（`%LOCALAPPDATA%\VRChatCreatorCompanion\VRChatProjects\TestProject`）を使います。
**元のプロジェクトは触らず、コピーに対して実行** してください（Library ごとコピーすると起動が速い）。

1. 全ギミックを含むテスト用パッケージを作る（9作品分。`make-test-package.mts` は `web/scripts/` に一時的に置いて実行）

   ```bash
   cp tools/verification/unity/make-test-package.mts scripts/tmp-make-test-package.mts
   npx tsx --conditions=react-server scripts/tmp-make-test-package.mts <出力先>/gimmicks-test.unitypackage cake   # 最後はテンプレートの slug
   rm scripts/tmp-make-test-package.mts
   ```

2. コピーしたプロジェクトに読み込む

   ```bash
   "C:/Program Files/Unity/Hub/Editor/2022.3.22f1/Editor/Unity.exe" -batchmode -nographics -projectPath <コピー> -importPackage <パッケージ> -logFile import.log -quit
   ```

3. Prefab の中身を確認する: `VRPLBatchTest.cs.txt` を `<コピー>/Assets/Editor/VRPLBatchTest.cs` として置き、
   `-batchmode -executeMethod VRPLBatchTest.Run -logFile build.log` で実行。ログの `VRPLTEST` 行に部品とスクリプトの設定値が出る
4. 再生モード（ClientSim）で動きを確認する: `VRPLPlayTest.cs.txt` を `Assets/Editor/VRPLPlayTest.cs` として置き、
   **GUI モード**（`-batchmode` を付けない）で `-executeMethod VRPLPlayTest.Run -logFile play.log` を実行。
   触る・近づく・持って振るを自動で行い、ログの `VRPLPLAY` 行にパーティクル・発光・揺れの状態が出る。終わると Unity が自動で閉じる

### 注意
- バッチモードと GUI では Unity の動きが違う（バッチモードで問題が出なくても GUI で固まった例がある）。最終確認は GUI で行う
- バッチモードで読み込んだ直後は UdonSharp のコンパイルが走らないことがある（組み立てスクリプトは組み立て時に毎回コンパイルするので Prefab は正しくできる）
- ClientSim は1人分しか動かないため、全員への同期は VRChat の Build & Test（クライアント2つ）で確認する

## 導入ガイドの画像の撮り直し（unity/）

`web/public/guide/` の 3 枚（Import の確認画面・Project ウィンドウ・シーンに置いた画面）は、GUI の Unity で自動で撮っています。Unity の画面が変わったときなどに撮り直します。

1. TestProject をコピーし、コピーの `Assets/VRPrintLab` を消す（初めて読み込む状態にする）
2. 撮影用のパッケージ（タペストリー・見本の画像）を作る

   ```bash
   cp tools/verification/unity/guide-package.mts scripts/tmp-guide-package.mts
   npx tsx --conditions=react-server scripts/tmp-guide-package.mts <出力先>/VRPrintLab_tapestry_20261112143000.unitypackage
   rm scripts/tmp-guide-package.mts
   ```

3. `VRPLGuideShots.cs.txt` を `<コピー>/Assets/Editor/VRPLGuideShots.cs` として置き、**GUI モード** で実行する。環境変数で、読み込むパッケージ（`VRPL_GUIDE_PKG`）、画像の保存先（`VRPL_GUIDE_OUT`）、パッケージの名前（`VRPL_GUIDE_NAME`）を渡す。終わると Unity が自動で閉じる

   ```bash
   VRPL_GUIDE_PKG=<パッケージ> VRPL_GUIDE_OUT=<保存先> VRPL_GUIDE_NAME=VRPrintLab_tapestry_20261112143000      "C:/Program Files/Unity/Hub/Editor/2022.3.22f1/Editor/Unity.exe" -projectPath <コピー> -executeMethod VRPLGuideShots.Run -logFile guide.log
   ```

4. 保存先の 3 枚を切り抜いて WebP にする（2026-11-12 の版: Import の画面は一覧の下の空白を詰める、Project ウィンドウは下の段の左 720px、シーンは上の段の左側）

- 画面の画素をそのまま読むので、撮影中は Unity のウィンドウの上に別のウィンドウを重ねない
- Import の画面の位置や大きさをスクリプトから変えると、描き直しの途中が写る。大きさは Unity が前回の値を覚えているので、手で調整してから撮る
- VRChat 本体のない PC で UdonSharp が出すエラーは、撮影の前に Console を消去して画面に写さない

