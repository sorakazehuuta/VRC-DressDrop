# 動作確認用スクリプト

開発中の確認に使ったスクリプトです（自動テストとして整備するのは Phase 9 の予定）。
いずれも **テスト用ユーザーを作って最後に削除** します。Supabase は `.env.local` の本番プロジェクトを使うので注意してください。

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
node --env-file=.env.local tools/verification/e2e/gimmick-e2e.cjs   # ギミックの選択・内訳・差額の課金
```

スクリーンショットは `tools/verification/e2e/shots/`（`SHOTS_DIR` で変更可）に保存されます。
3D 表示のためヘッドレス Chromium を SwiftShader で起動しています（初回は `npx playwright install chromium`）。

## Unity での確認（unity/）

Unity 2022.3.22f1 と、VCC の TestProject（`%LOCALAPPDATA%\VRChatCreatorCompanion\VRChatProjects\TestProject`）を使います。
**元のプロジェクトは触らず、コピーに対して実行** してください（Library ごとコピーすると起動が速い）。

1. 全ギミックを含むテスト用パッケージを作る（9作品分。`make-test-package.mts` は `web/scripts/` に一時的に置いて実行）

   ```bash
   cp tools/verification/unity/make-test-package.mts scripts/tmp-make-test-package.mts
   npx tsx --conditions=react-server scripts/tmp-make-test-package.mts <出力先>/gimmicks-test.unitypackage
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
