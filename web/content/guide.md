# VRChat への導入ガイド（ワールド・アバター共通）

VRPrintLab でダウンロードしたパッケージ（.unitypackage）は、色やプリントがすべて設定済みです。Unity プロジェクトに読み込んで、Prefab を置くだけで使えます。

## 1. パッケージを読み込む

1. 使いたいワールドまたはアバターの Unity プロジェクトを開きます。
2. ダウンロードした .unitypackage を、Unity の画面にドラッグ＆ドロップします。
3. 確認画面（Import Unity Package）が出たら、右下の「Import」（日本語表示では「インポート」）を押します。

![Import Unity Package の確認画面。右下の「インポート」を押す](/guide/import.webp)

## 2. Prefab を確かめる

読み込みが終わると、Project ウィンドウに完成品の Prefab（青いキューブのアイコン）が自動で作られます。

- 場所: `Assets/VRPrintLab/` の中の、ダウンロードしたファイルと同じ名前のフォルダ
- 名前: `VRPrintLab_<テンプレート>_<日時>.prefab`

![Project ウィンドウで、作品のフォルダの中の Prefab を選んだ画面](/guide/prefab.webp)

## 3. シーンやアバターに置く

Prefab をシーン（Hierarchy）やアバターの中にドラッグ＆ドロップし、位置・向き・大きさを調整すれば完了です。

![Prefab をシーンに置いた画面。Hierarchy にも同じ名前で表示される](/guide/placed.webp)

## うまくいかないとき

- **Prefab が作られない:** メニューの **Tools > VRPrintLab > Prefab をすべて作り直す** を実行してください。
- **ギミックが動かない:** ギミックはワールドでだけ動きます（UdonSharp を使います）。VCC か ALCOM で UdonSharp を追加してから、上の「作り直す」を実行してください。
- **ダウンロードし直したい:** [ダウンロード履歴](/downloads)から、もう一度ダウンロードできます。
