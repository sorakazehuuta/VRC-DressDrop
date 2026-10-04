# ギミックの追加・編集・削除

ギミック（回転・ライト・パーティクルなど）は、`catalog/<slug>.json` を1つ書いて同期コマンドを実行するだけで追加・変更できます。
トークン数や名前を変えるだけなら、アプリのコードを触る必要はありません。

```
gimmicks/
  catalog/            ← ギミックの定義（1ファイル = 1ギミック）
  unity/
    Runtime/          ← ギミックのスクリプト（UdonSharp）。全作品で共通
    Editor/           ← unitypackage を読み込んだときに Prefab を組み立てるスクリプト
```

## よくある作業

| やりたいこと | 手順 |
|---|---|
| トークン数を変える | `catalog/<slug>.json` の `tokenCost` を書き換えて `npm run gimmicks:sync` |
| 名前・説明を変える | `name` / `description` を書き換えて `npm run gimmicks:sync` |
| 一時的に隠す | `isPublic` を `false` にして `npm run gimmicks:sync` |
| 削除する | `catalog/<slug>.json` を消して `npm run gimmicks:sync`（非公開になる。使っている作品を壊さないため DB からは消さない） |
| 設定項目を足す | `params` に追加。スクリプトを使うギミックなら、同じ名前の `public` フィールドを `.cs` に足す |
| 新しいギミックを作る | 下の「新しいギミックの作り方」 |

```bash
npm run gimmicks:check   # 検証だけ（何も登録しない）
npm run gimmicks:sync    # Supabase に登録・更新
```

`gimmicks:check` は、書き方の誤り・存在しないスクリプト・スクリプトにない設定項目・存在しない組み合わせ先を検出します。

## catalog/<slug>.json の書き方

```json
{
  "slug": "spin",
  "name": "ずっと回転する",
  "category": "動き",
  "description": "その場でゆっくり回り続けます。",
  "note": "",
  "tokenCost": 1,
  "isPublic": true,
  "sortOrder": 210,
  "script": "VRPLSpin",
  "groups": ["motion"],
  "requiresAny": [],
  "setup": ["pivot-center"],
  "params": [
    { "key": "speed", "label": "回る速さ", "type": "number", "min": 5, "max": 360, "step": 5, "default": 45, "unit": "°/秒" },
    { "key": "axis", "label": "回転の軸", "type": "select", "default": "1",
      "options": [{ "value": "1", "label": "縦（Y軸）" }, { "value": "0", "label": "横（X軸）" }] }
  ],
  "fixed": {}
}
```

| 項目 | 説明 |
|---|---|
| `slug` | 英小文字・数字・`-`。ファイル名と同じにする。保存済みの作品はこの値で参照するので、公開後は変えない |
| `category` | エディタでの見出し。同じ文字列のものがまとまる |
| `note` | 選んだときに出す注意書き（例: Quest で重い） |
| `sortOrder` | 並び順（小さいほど上） |
| `script` | `unity/Runtime/<script>.cs` のクラス名（`VRPL` で始める）。組み立てだけで済むものは `null` |
| `groups` | 同じグループのギミックは同時に選べない（下の表） |
| `requiresAny` | このうちどれかと一緒に選んだときだけ使える（例: 軌跡は動くものと一緒に） |
| `setup` | Unity 側の組み立て手順（下の表） |
| `params` | エディタに出す設定項目。`key` はスクリプトの `public` フィールド名と同じにすると、その値が入る |
| `fixed` | 画面に出さずにスクリプトへ渡す値（同じスクリプトを別のギミックとして使い回すとき用） |

設定項目の種類（`type`）: `number`（スライダー）、`boolean`（チェック）、`color`（色）、`select`（選択肢）

### groups（同時に選べないもの）

| グループ | 意味 |
|---|---|
| `interact` | 触ったときの動作。1つの物を触ったときに2つ動くと分かりにくいため1つだけ |
| `motion` | 本体の動き（回転・揺れ・持つ・ついてくる） |
| `material` | 本体の光り方・透け方（マテリアルを書き換えるもの） |
| `particles` / `light` / `aura` | 同じ演出を重ねないため |

### setup（Unity 側の組み立て手順）

`unity/Editor/VRPrintLabPrefabBuilder.cs` が対応しているものだけ使えます。

| 手順 | 内容 | 使う設定項目 |
|---|---|---|
| `switch` | 本体の横に小さなスイッチを置き、スクリプトはスイッチに付ける。`target` に本体が入る | |
| `pivot-center` / `pivot-bottom` | 本体の中心 / 底を軸に動かす親を作る。`pivot` に入る | |
| `particles-sparkle` | キラキラのパーティクル。`particles` に入る | `color`, `amount`（0 なら放出しない）, `startOn` |
| `particles-aura` | 足元から立ちのぼる粒 | `color` |
| `light` | ポイントライト。`lightSource` に入る | `color`, `intensity`, `range`, `startOn` |
| `trail` | 軌跡 | `color`, `time`, `width` |
| `transparent-materials` | 半透明のマテリアルを複製。`normalMaterials` / `transparentMaterials` / `materialCounts` に入る | `opacity` |
| `emission-static` | いつも発光させる | `glowColor`, `intensity` |
| `emission-dynamic` | スクリプトから発光を変えられるようにする | |
| `magic-circle` | 足元に回る魔法陣 | `color`, `size`, `spinSpeed` |
| `pickup` | VRC Pickup と Rigidbody | `physics` |
| `object-sync` | VRC Object Sync（位置を全員に同期） | |

スクリプトのフィールドには、名前に応じて自動で値が入ります: `renderers`（本体のレンダラー）、`target`、`pivot`、`particles`、`lightSource`、各 `params` / `fixed` の値。

## 新しいギミックの作り方

1. 既存の `setup` の組み合わせだけで作れるなら、`catalog/<slug>.json` を書くだけでよい（例: 「キラキラのパーティクル」）
2. 動きが必要なら `unity/Runtime/VRPL<名前>.cs` を UdonSharp で書く
   - ファイル全体を `#if UDONSHARP` 〜 `#endif` で囲む（UdonSharp がない環境でエラーにしないため）
   - `namespace VRPrintLab`、クラス名は `VRPL` で始める
   - 同期が必要なら `[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]` と `[UdonSynced]`
3. 新しい組み立て手順が必要なら、`SETUP_STEPS`（`src/lib/gimmicks/schema.ts`）と `VRPrintLabPrefabBuilder.cs` の両方に追加する
4. `npm run gimmicks:check` → `npm run gimmicks:sync`
5. エディタで選んでダウンロードし、Unity で Prefab が組み立てられ、動くことを確認する

スクリプトは購入済みの unitypackage には含まれたままなので、配布後にスクリプトを直した場合は、再ダウンロードしたパッケージで上書きされます（`Assets/VRPrintLab/_Runtime` は全作品で共通）。
