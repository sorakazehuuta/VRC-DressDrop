# テンプレートの登録手順

テンプレート（ケーキ、マグカップなど）は、Unity で書き出した **.unitypackage** をこのフォルダに置き、コマンドを実行して登録します。
アプリのコードを変更する必要はありません。

全体の流れ:

1. `templates` ブランチに切り替える
2. Unity でテンプレートの unitypackage を書き出す
3. `templates/<slug>/` に unitypackage と template.json を置く
4. `npm run templates:prepare` でブラウザ用のプレビューを作る
5. `npm run templates:check` で確認し、サムネイルを作る
6. `npm run templates:sync` で非公開のまま登録し、サイトと Unity で確認する
7. 管理画面（/admin/catalog）で公開し、コミットする

コマンドはすべて `web` フォルダで実行します（Windows の PowerShell で `npm` が動かないときは `npm.cmd` と打ちます）。

---

## 0. 最初に1回だけ用意するもの

| もの | 用途 | 備考 |
|---|---|---|
| Node.js（LTS） | コマンドの実行 | `web` フォルダで `npm install` を1回実行する |
| Unity 2022.3（Unity Hub から） | プレビューの作成（templates:prepare） | VRChat 用と同じ 2022.3 系。Unity Hub にログインしてライセンスを有効にしておく |
| `web/.env.local` | Supabase への登録（templates:sync） | 管理者から受け取る。**秘密キーなのでチャットや GitHub に貼らない** |
| Chromium | サムネイルの自動作成 | `npx playwright install chromium` を1回実行する |

Unity は自動で探します（`C:\Program Files\Unity\Hub\Editor\2022.3.*`）。別の場所に入れた場合は、環境変数 `UNITY_PATH` に Unity.exe のパスを指定してください。

## 1. templates ブランチに切り替える

テンプレートの追加・更新は、**`templates` ブランチ** にコミットします（サイトの機能の変更とは分けて管理するため）。

```bash
git switch templates
git pull
```

サイト側（`main`）の変更を取り込みたいときは、`templates` ブランチで `git merge main` を実行します。

## 2. Unity で unitypackage を書き出す

### モデルの作り方の決まり

- **1つのフォルダにまとめる**: `Assets/VRPrintLab/<名前>/` の下にモデル（FBX）・マテリアル・テクスチャ・Prefab を入れる
- **Prefab を作る**: シーンに置いたときの見た目（大きさ・位置・マテリアル・パーティクル）を Prefab にしておく。サイトのプレビューも、購入者に届くモデルも、この Prefab の見た目になる。Prefab が複数あるときは template.json の `files.prefab` で使うものを指定する
- **色を変える部分とプリント面は、それぞれ別のマテリアル（.mat ファイル）にする**
  - FBX に埋め込まれたマテリアルは使えません。FBX を選んで Inspector の Materials タブ →「Extract Materials...」で .mat にしてください
  - 同じ名前のマテリアルを2つ作らない（template.json ではマテリアルの名前で指定するため）
- **プリント面**: UV を 0〜1 いっぱいに展開する（画像の上が UV の上）。マテリアルのタイリング・オフセットは無視され、画像全体が UV の範囲に貼られる
- **シェーダーは Standard を推奨**（PC / Quest どちらのワールドでも表示できる）
- **スクリプト（.cs / .dll）は入れない**（入っていると登録できません）
- ポリゴン数の目安は Quest 向けで 1万三角形以下（超えると注意が出るが登録はできる）
- 他人が作ったモデルを使う場合は、このサービスで加工・販売してよい利用条件か確認する

### 書き出し方

1. Project ウィンドウで Prefab を右クリック →「Export Package...」
2. 「Include dependencies」にチェックが入った状態で、モデル・マテリアル・テクスチャがすべて選ばれていることを確認する（スクリプトが混ざっていたら外す）
3. 「Export...」で保存する（ファイル名は自由。例: `mug.unitypackage`）

## 3. フォルダと template.json を作る

```
templates/
  mug/                  ← フォルダ名 = slug（英小文字・数字・-）。サイトの URL になる（/editor/mug）
    template.json       ← 設定（下記）
    mug.unitypackage    ← 2 で書き出したもの
    preview.glb         ← 4 で自動で作られる
    thumbnail.png       ← 5 で自動で作られる（自分で用意してもよい。4:3 推奨）
```

template.json の例:

```json
{
  "slug": "mug",
  "name": "マグカップ",
  "category": "グッズ",
  "description": "好きな画像を貼れるマグカップ。本体の色も変えられます。",
  "tokenCost": 1,
  "isPublic": false,
  "sortOrder": 30,
  "files": { "package": "mug.unitypackage" },
  "slots": [
    { "key": "base", "type": "color", "label": "本体の色", "material": "Mug Body", "defaultColor": "#ffffff" },
    { "key": "print", "type": "print", "label": "プリント", "material": "Mug Print", "background": { "slot": "base" }, "aspect": 2.4 }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `slug` | フォルダ名と同じにする |
| `name` / `category` / `description` | サイトに表示する名前・カテゴリ・説明。カテゴリは「グッズ」「パネル・ディスプレイ」「看板」「カフェ・バー用品」「フード・ドリンク」から選ぶ（一覧の絞り込みに使う。新しいカテゴリを作るときは `src/lib/templates/categories.ts` に足す） |
| `nameReading` | 名前の読み（ひらがな、省略可）。一覧の「名前順」に使う。初回の登録だけに使い、あとは管理画面で変える |
| `tokenCost` | ダウンロードに必要なトークン数 |
| `isPublic` | 初回の登録のときの公開状態。`false` の間は一覧に出ない（管理者だけがエディタの URL で確認できる）。登録後の公開・非公開は管理画面で変える |
| `sortOrder` | 同時に新しく登録するもの同士の並び順（小さいほど前）。新しいものは今の一覧の最後に並ぶ。登録後の並び順は管理画面のドラッグで変える |
| `files.package` | unitypackage のファイル名 |
| `files.prefab` | 使う Prefab の Unity 上のパス（例: `Assets/VRPrintLab/Mug/Mug.prefab`）。Prefab が1つだけなら書かなくてよい |
| `files.thumbnail` | 自分で用意したサムネイル画像のファイル名（省略すると `thumbnail.png`） |
| `slots` | 利用者が編集できる部分。画面にはこの順番で並ぶ |

### スロット（編集できる部分）

**色を変える部分 `"type": "color"`**

| 項目 | 説明 |
|---|---|
| `key` | 英小文字の識別子（テンプレート内で重複しないこと）。本体の色は `base` にそろえる |
| `label` | 画面に表示する名前（例: 本体の色、クリームの色） |
| `material` | Unity のマテリアル名（完全一致。`•` などの記号や空白も含めてそのまま書く） |
| `defaultColor` | 初期色（`#RRGGBB`）。Unity のマテリアルの色に合わせると自然 |

**画像を貼る面 `"type": "print"`**

| 項目 | 説明 |
|---|---|
| `key` / `label` / `material` | color と同じ |
| `background` | 画像がない部分の扱い。`"transparent"` で透明（切り抜き）。面が本体の一部で、透明にすると穴が開く場合は `{ "slot": "base" }` のように色スロットを指定すると、その色で塗る |
| `aspect` | プリント面の実寸の **幅÷高さ**。`templates:prepare` が計算した値を書く（次の手順） |
| `textureSize` | 出力テクスチャの長辺ピクセル数（256〜2048、既定: 2048） |

マテリアル名が分からないときは、次の `templates:prepare` を実行すると一覧が表示されます。

## 4. プレビューを作る（templates:prepare）

```bash
npm run templates:prepare -- mug
```

Unity をバックグラウンドで起動して Prefab を読み込み、ブラウザ用のモデル `preview.glb` を作ります（初回は Unity の準備に数分かかります。Unity の画面は開きません）。
**unitypackage を差し替えたときは、必ずもう一度実行してください**（古いままだと次の check でエラーになります）。

実行結果の例:

```
[mug]
  Prefab: Assets/VRPrintLab/Mug/Mug.prefab（マテリアル 3 個）
  preview.glb を作りました（メッシュ 2 個 / 三角形 4120 / 0.3 MB）
  マテリアル: Mug Body / Mug Print / Mug Handle
  プリント面 "print" の 幅÷高さ: 2.38（template.json: 1）  ← template.json の aspect をこの値にしてください
```

- 「マテリアル」の行が、template.json の `material` に書ける名前です
- 「幅÷高さ」の行に「←」が出たら、template.json の `aspect` をその値に直します（直したあとの prepare のやり直しは不要）
- 「最初の視点」は、エディタとサムネイルでモデルを最初に見る向きです。1つ目のプリントスロットの面の中心（画像の中心が貼られる位置）を正面から見るように自動で決まります。プリント面の向きを変えたいときは、Unity で UV やモデルの向きを直してください
- 「プレビューに表示しないもの」はパーティクルなどです。ブラウザのプレビューには出ませんが、購入者に届く unitypackage には入ります

プレビューに反映されるのは、マテリアルの色・つや・金属感・透明（Cutout / Fade）・発光・PNG / JPEG のテクスチャです。特殊なシェーダーの見た目は再現されないことがあります。

## 5. 確認とサムネイル

```bash
npm run templates:check -- mug        # 確認だけ（Supabase には何もしない）
npm run templates:thumbnails -- mug   # thumbnail.png を作る（作り直すときは -- mug --force）
```

`templates:check` は次の点を確認します。エラーがあれば直してから先へ進みます。

- template.json の書き方
- unitypackage が読めるか、Prefab があるか、スクリプトが入っていないか
- `material` に書いた名前の .mat が unitypackage にあり、Prefab で表示されている面に使われているか
- preview.glb が今の unitypackage から作られたものか
- プリント面に UV があるか
- ポリゴン数が Quest の目安を超えていないか（超えていたら注意）

サムネイルは、モデルを正面から描画し、プリント面に見本として VRPrintLab のアイコンを貼った画像です。`thumbnail.png` を開いて、向きと見え方を確認してください。

## 6. 非公開で登録して確認する（templates:sync）

**ここから Supabase（サイトのデータ）を書き換えます。** `isPublic` が `false` になっていることを確認してから実行します。

```bash
npm run templates:sync -- mug
```

- slug を付けると、そのテンプレートだけを登録・更新します（付けないと全テンプレート）
- 同じ slug は上書き更新になります

登録できたら、次を確認します。

1. 開発サーバーを起動（`npm run dev`）し、**管理者アカウント** で `http://localhost:3000/editor/mug` を開く
   - 色の変更、画像の貼り付け（向き・伸び・位置）、ギミックのプレビューを確かめる
2. 保存してダウンロードし、Unity（VRChat のワールドプロジェクトのコピー）に読み込む
   - 自動で作られる Prefab をシーンに置き、色・プリント・大きさがサイトと同じか確かめる

問題がなければ、管理画面の「テンプレート・ギミック」（/admin/catalog）で「公開」にすると一覧に表示されます。登録済みのテンプレートのトークン数・公開状態は、templates:sync では変わりません（管理画面で変えた値を残すため）。記録のため template.json の `isPublic` も `true` にしてコミットしておきます。

## 7. コミットする

`templates` ブランチに、`templates/mug/` のファイル（template.json・unitypackage・preview.glb・thumbnail.png）をコミットしてプッシュします。

```bash
git add templates/mug
git commit -m "マグカップのテンプレートを追加"
git push
```

GitHub へのプッシュと Supabase への登録（templates:sync）は別の操作です。どちらも行ってください。

---

## 更新・取り下げ

- **モデルを直す**: unitypackage を差し替え → `templates:prepare` → `templates:check` → `templates:thumbnails -- mug --force` → `templates:sync -- mug` → コミット
- **名前・説明だけ直す**: template.json を直して `templates:sync -- mug` → コミット
- **トークン数を変える・一覧から外す**: 管理画面（/admin/catalog）で変える。すでに作られた作品があるため、テンプレートのフォルダやデータは消さない

## 仕組み（参考）

- `templates:prepare` は `web/.template-bake/`（git 管理外）に作業用の Unity プロジェクトを作り、unitypackage の中身を展開して Prefab を読み込み、表示されているメッシュとマテリアルを書き出します。Unity の座標（左手系）は glTF の座標に変換しています
- 購入されたときは、unitypackage の中身を作品のフォルダ（`Assets/VRPrintLab/<作品名>/Template/`）に複製し、スロットのマテリアルの色とテクスチャだけを書き換えます。作品ごとに GUID を振り直すので、同じテンプレートの作品を複数読み込んでも互いに上書きしません
- 作品の Prefab は、テンプレートの Prefab にギミックを組み合わせて購入者の Unity で自動的に組み立てられます

## よくあるエラー

| 表示 | 対処 |
|---|---|
| Unity が見つかりません | Unity Hub で 2022.3 系をインストールする。別の場所なら `UNITY_PATH` を設定する |
| Unity が正常に終了しませんでした | Unity Hub でログイン・ライセンスを確認する。`web/.template-bake/unity-<slug>.log` に詳細がある |
| マテリアル "…" が unitypackage にありません | 名前の打ち間違い、または FBX に埋め込まれたまま。Extract Materials して書き出し直す |
| Prefab が複数あります | template.json に `files.prefab` を書く |
| スクリプトが含まれています | 書き出すときにスクリプトのチェックを外す |
| preview.glb が今の unitypackage から作られたものではありません | `templates:prepare` をやり直す |
| UV が裏返っていて、画像が左右反転します | プリント面の UV が鏡像になっている。Blender で UV を左右反転（U 方向に -1 倍）して書き出し直す |
| 画像が縦や横に伸びる | `aspect` を prepare が表示した値にする。UV がゆがんでいないか確認する |
| 画像の部分に穴が開く | `background` を色スロット（`{ "slot": "base" }`）にする |
| 登録で package_prefab_path のエラー | 管理者に `supabase/migrations/20261016000000_unitypackage_templates.sql` の実行を依頼する |
| SUPABASE_SECRET_KEY を設定してください | `web/.env.local` がない。管理者に確認する |
