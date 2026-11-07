# VRChat への導入ガイド

VRPrintLab でダウンロードしたパッケージ（.unitypackage）を、VRChat のワールドに置くまでの手順です。

## 1. 準備するもの

- パソコン（Windows）
- VRChat のアカウント（ワールドをアップロードするには、VRChat の条件を満たしている必要があります）
- Unity Hub と Unity 2022.3（VRChat が指定しているバージョン）
- VRChat Creator Companion（VCC）または ALCOM（どちらも VRChat 用のプロジェクトを作るツール）

Unity のバージョンは、VCC・ALCOM の画面で案内されるものを入れてください。

## 2. ワールドのプロジェクトを作る

1. VCC（または ALCOM）を開き、新しいプロジェクトを作ります。テンプレートは **Worlds** を選びます。
2. 作ったプロジェクトを開くと、Unity が起動します。

![VCC で Worlds のプロジェクトを作る画面](placeholder)

すでにワールドのプロジェクトがある場合は、それを使えます。

### ギミックを付けた場合

ギミックは UdonSharp という仕組みで動きます。VCC（または ALCOM）でプロジェクトの「Manage Project」を開き、UdonSharp が入っていなければ追加してください（VRChat SDK の版によっては、最初から入っています）。

![Manage Project で UdonSharp を確認する画面](placeholder)

## 3. パッケージを読み込む

1. VRPrintLab のエディタで「ダウンロード」を押し、パッケージを保存します（[ダウンロード履歴](/downloads)からも再ダウンロードできます）。
2. 保存した .unitypackage を、Unity のウィンドウにドラッグ＆ドロップします。
3. 読み込む内容の一覧が出るので、「Import」を押します。

![Import の確認画面](placeholder)

読み込みが終わると、`Assets/VRPrintLab/VRPrintLab_<番号>/` の中に、作品の Prefab（`VRPrintLab_<番号>.prefab`）が自動で作られます。色・プリント・ギミックは設定済みです。

Prefab が作られないときは、メニューの **Tools > VRPrintLab > Prefab をすべて作り直す** を実行してください。

## 4. ワールドに置く

1. 作られた Prefab を、Hierarchy（シーンの一覧）またはシーンの画面にドラッグします。
2. 位置・向き・大きさを調整します。

![Prefab をシーンに置いた画面](placeholder)

ギミックの設定値（回る速さなど）は、Prefab の中のオブジェクトを選ぶと Inspector で変えられます。

## 5. PC と Quest の切り替え

Quest でも見られるワールドにするには、PC 用と Android（Quest）用の両方をアップロードします。

1. **File > Build Settings** を開き、Platform で **Android** を選んで「Switch Platform」を押します（PC に戻すときは Windows を選びます）。
2. 切り替えには時間がかかります。終わったら、次の「6. アップロード」を行います。

Quest では処理の重さに制限があります。プリントのテクスチャは 2048px 以内にしてありますが、テンプレートによってはポリゴン数が Quest の目安（1つあたり 1万程度）を超えます。多く置くとワールドが重くなるので、Quest で動きを確かめてください。

## 6. アップロード

1. メニューの **VRChat SDK > Show Control Panel** を開き、VRChat のアカウントでログインします。
2. 「Builder」タブで、ワールドの名前などを入力して「Build and Upload」を押します。
3. PC 用と Quest 用の両方を出す場合は、プラットフォームを切り替えて、もう一度アップロードします。

![VRChat SDK の Builder 画面](placeholder)

## 困ったとき

### Prefab が作られない・中身が足りない

**Tools > VRPrintLab > Prefab をすべて作り直す** を実行してください。Console に「スクリプトが見つかりません」と出る場合は、UdonSharp を追加してから、もう一度実行します。

### ギミックが動かない

UdonSharp が入っているかを確認し、**Tools > VRPrintLab > Prefab をすべて作り直す** を実行してください。ギミックの動きは、Unity の再生ボタン（ClientSim）でも確かめられます。ほかの人への同期は、VRChat の「Build & Test」で、2人以上で確かめてください。

### 同じ作品をもう一度ダウンロードした

同じ版のパッケージを読み込み直すと、前に読み込んだものが上書きされます。見た目を変えた新しい版は、別のフォルダとして読み込まれます。

### 作った作品を販売・配布したい

[よくある質問](/faq)と[利用規約](/terms)の第6条・第7条をご覧ください。パッケージに同梱している LICENSE.txt にも、利用条件を書いています。
