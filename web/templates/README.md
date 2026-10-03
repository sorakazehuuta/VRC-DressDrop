# テンプレートの追加方法

テンプレート（Tシャツ、アクスタなど）は、このフォルダにファイルを置いてコマンドを1つ実行するだけで追加・更新できます。
アプリのコードを変更する必要はありません。

## 1. 3Dモデルを用意する（Blender）

- 色を変えたい面と、画像を貼りたい面に **別々のマテリアル** を割り当てる
  - マテリアル名は英数字で付ける（例: `Mat_Base`, `Mat_Print`, `Mat_Print_Back`）
- 画像を貼る面は **UV 展開** し、UV が 0〜1 の範囲いっぱいに収まるようにする
  - 画像の上が UV の上側になる向きにする
- ポリゴン数は Quest の目安（1万三角形以下）に収める
- 次の2形式で書き出す
  - `model.glb`（ブラウザのプレビュー用）: ファイル → エクスポート → glTF 2.0（形式: glb）
  - `model.fbx`（unitypackage 同梱用）: ファイル → エクスポート → FBX

## 2. フォルダを作る

```
templates/
  acrylic-stand/        ← フォルダ名 = slug（英小文字・数字・-）
    template.json
    model.glb
    model.fbx
    thumbnail.png       ← 任意（一覧に表示される画像。4:3 推奨。なければ自動生成できる）
```

## 3. template.json を書く

```json
{
  "slug": "acrylic-stand",
  "name": "アクリルスタンド",
  "category": "グッズ",
  "description": "イラストを切り抜いて飾れるアクスタ。",
  "tokenCost": 1,
  "isPublic": false,
  "sortOrder": 20,
  "files": { "preview": "model.glb", "package": "model.fbx", "thumbnail": "thumbnail.png" },
  "slots": [
    { "key": "base", "type": "color", "label": "台座の色", "material": "Mat_Base", "defaultColor": "#ffffff" },
    { "key": "print", "type": "print", "label": "イラスト", "material": "Mat_Print", "background": "transparent", "aspect": 0.7 }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `tokenCost` | ダウンロードに必要なトークン数 |
| `isPublic` | `false` の間は一覧に出ない（管理者だけが確認できる） |
| `sortOrder` | 一覧の並び順（小さいほど前） |
| `slots` | 編集できる部分。画面にはこの順番で並ぶ |

### スロットの種類

**`"type": "color"`（色を変える面）**

| 項目 | 説明 |
|---|---|
| `key` | 英小文字の識別子（テンプレート内で重複しないこと） |
| `label` | 画面に表示する名前 |
| `material` | Blender で付けたマテリアル名（完全一致） |
| `defaultColor` | 初期色（`#RRGGBB`） |

**`"type": "print"`（画像を貼る面）**

| 項目 | 説明 |
|---|---|
| `key` / `label` / `material` | color と同じ |
| `background` | 画像がない部分の扱い。`"transparent"` で透明（アクスタの切り抜きなど）。プリント面が本体の一部で、透明にすると穴が開く場合は `{ "slot": "base" }` のように色スロットを指定すると、その色で塗りつぶす |
| `aspect` | プリント面の実寸の **幅÷高さ**。画像が縦や横に伸びて見えるときに調整する（既定: 1） |
| `textureSize` | 出力テクスチャの長辺ピクセル数（256〜2048、既定: 2048） |

## 4. 検証して登録する

```bash
npm run templates:check            # 検証だけ（何も登録しない）
npm run templates:thumbnails       # サムネイル（thumbnail.png）がなければ3Dモデルから自動で作る
npm run templates:sync             # 全テンプレートを Supabase に登録・更新
npm run templates:sync -- acrylic-stand   # 1つだけ登録・更新
```

`templates:thumbnails` は、モデルを正面から描画し、プリント面に見本として VRPrintLab のアイコンを貼った 800×600 の画像を作ります。モデルを差し替えたときは `-- --force` を付けて作り直してください。template.json の `files.thumbnail` で自分で用意した画像を指定している場合は、そちらが使われます（初回だけ `npx playwright install chromium` が必要です）。

`templates:check` は次の点を自動で確認します。問題があれば、何も登録せずにエラーを表示します。

- template.json の書き方
- ファイルがそろっているか
- `material` に書いた名前が glb と fbx の両方に実在するか
- プリント面に UV があるか
- ポリゴン数が Quest の目安を超えていないか（超えていたら注意を表示）

登録後、`isPublic: false` のまま `/editor/<slug>` を管理者アカウントで開いて見た目を確認し、問題なければ `true` にして再度 `templates:sync` してください。
