import "server-only";
import { siteUrl, termsVersionLabel } from "@/lib/legal";
import { backgroundColor, type EditorParams } from "@/lib/templates/params";
import type { Slot } from "@/lib/templates/schema";
import { gimmickScripts, runtimeAssets, workBuildAssets, type GimmickInput } from "./gimmick-assets";
import { setCutout, setMainTexture, setMaterialColor, templateFiles } from "./template-package";
import { renderPrintTexture } from "./texture";
import { buildUnityPackage, deterministicGuid, textAssetMeta, textureMeta, type PackageAsset } from "./unitypackage";

export type WorkPackageInput = {
  purchaseId: string;
  workName: string;
  packageName: string;
  // prefabPath: テンプレートの unitypackage の中で使う Prefab（Assets/...）
  // nameEn: 英語のテンプレート名（README・LICENSE の英語の部分に使う。空なら日本語の名前）
  template: { slug: string; name: string; nameEn?: string; slots: Slot[]; prefabPath: string };
  params: EditorParams;
  gimmicks: GimmickInput[];
  // テンプレートの unitypackage
  templatePackage: Buffer;
  images: Map<string, Buffer>;
  createdAt: Date;
};

// フォルダ・Prefab・ダウンロードのファイルで共通の名前。環境によって文字化けしないよう、テンプレートの slug と購入日時（日本時間）で作る
export function packageBaseName(templateSlug: string, purchasedAt: Date) {
  const stamp = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Tokyo" }).format(purchasedAt).replace(/\D/g, "");
  return `VRPrintLab_${templateSlug}_${stamp}`;
}

// 名前を記録する前の購入は、テンプレートが分からなくても購入日時で区別する
export function purchaseFileName(purchase: { package_name: string | null; created_at: string }) {
  return `${purchase.package_name ?? packageBaseName("work", new Date(purchase.created_at))}.unitypackage`;
}

function readme(input: WorkPackageInput, folder: string, prefabName: string) {
  const date = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(input.createdAt);
  const gimmickLines = input.gimmicks.length
    ? input.gimmicks.map((g) => `- ${g.def.name}：${g.def.description}${g.def.note ? `（${g.def.note}）` : ""}`).join("\n")
    : "なし";
  const needsUdon = gimmickScripts(input.gimmicks).size > 0;
  return `VRPrintLab で作成したモデル
==============================

作品名      : ${input.workName}
テンプレート: ${input.template.name}
作成日時    : ${date}

■ 使い方
1. VRChat Creator Companion（VCC）または ALCOM で作成したワールドプロジェクトを Unity で開きます。
${needsUdon ? "   ギミックを使うため、VCC の Manage Project で UdonSharp を追加しておいてください。\n" : ""}2. この unitypackage を Unity のウィンドウにドラッグ＆ドロップし、「Import」を押します。
3. 読み込みが終わると、Assets/VRPrintLab/${folder}/${prefabName}.prefab が自動で作られます。
   これを Hierarchy（シーン）にドラッグして配置してください。色・プリント・ギミックは設定済みです。
   ※ Prefab が作られないときは、メニューの Tools > VRPrintLab > Prefab をすべて作り直す を実行してください。
4. 位置・向き・大きさを調整して、ワールドをアップロードします。

■ ギミック
${gimmickLines}

■ PC / Quest について
プリントのテクスチャの最大サイズは 2048px に設定しています。
マテリアルのシェーダーはテンプレートのものをそのまま使っています。

■ 同梱ファイル
- ${prefabName}.prefab : シーンに置くもの（読み込み時に自動で作成）
- Template/ : テンプレートの3Dモデル・マテリアル・Prefab（色とプリントはこの作品用に設定済み）
- Tex_*.png : プリントのテクスチャ
- VRPrintLab.json : Prefab の組み立て設定
- LICENSE.txt : 利用条件
- Assets/VRPrintLab/_Runtime : Prefab の組み立てと、選んだギミックのスクリプト（ほかの作品と共通）

■ ご利用にあたって
自分が権利を持つ画像、または許諾を得た画像を貼った完成品は、VRChat の内外で利用でき、
BOOTH などで販売・無料配布もできます（販売用のライセンスや売上の歩合は不要です）。
画像を貼っていないテンプレート、画像を外したモデル、色を変えただけのモデルは、再配布・販売できません。
完成品を受け取った人は利用・配置・調整ができますが、このパッケージや取り出したモデル・テクスチャの
再配布・再販売はできません。詳しくは LICENSE.txt と利用規約（${termsUrl()}）をご覧ください。

${readmeEnglish(input, folder, prefabName)}`;
}

// README の英語の部分（日本語の部分と同じ内容。日本語を変えたらこちらも直す）
function readmeEnglish(input: WorkPackageInput, folder: string, prefabName: string) {
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(input.createdAt);
  const gimmickLines = input.gimmicks.length
    ? input.gimmicks.map((g) => `- ${g.def.en.name}: ${g.def.en.description}${g.def.en.note ? ` (${g.def.en.note})` : ""}`).join("\n")
    : "None";
  const needsUdon = gimmickScripts(input.gimmicks).size > 0;
  return `[English]

Model created with VRPrintLab
==============================

Work name : ${input.workName}
Template  : ${input.template.nameEn || input.template.name}
Created   : ${date} (JST)

■ How to use
1. Open your world project created with VRChat Creator Companion (VCC) or ALCOM in Unity.
${needsUdon ? "   This work uses gimmicks, so add UdonSharp from Manage Project in VCC first.\n" : ""}2. Drag and drop this unitypackage into the Unity window and click "Import".
3. When the import finishes, Assets/VRPrintLab/${folder}/${prefabName}.prefab is created automatically.
   Drag it into the Hierarchy (scene) to place it. Colors, prints, and gimmicks are already set up.
   * If the Prefab isn't created, run Tools > VRPrintLab > Prefab をすべて作り直す (Rebuild all Prefabs) from the menu.
4. Adjust the position, rotation, and scale, then upload your world.

■ Gimmicks
${gimmickLines}

■ PC / Quest
The maximum print texture size is set to 2048px.
The materials use the template's shaders as they are.

■ Included files
- ${prefabName}.prefab : The object to place in your scene (created automatically on import)
- Template/ : The template's 3D model, materials, and Prefab (colors and prints are set for this work)
- Tex_*.png : Print textures
- VRPrintLab.json : Settings for building the Prefab
- LICENSE.txt : Terms of use
- Assets/VRPrintLab/_Runtime : Scripts for building the Prefab and for the selected gimmicks (shared with other works)

■ Terms of use
Finished works with images you own the rights to (or have permission to use) can be used inside and outside VRChat,
and can be sold or distributed for free on BOOTH and similar platforms (no commercial license or revenue share required).
Templates without images, models with the images removed, and models where only the colors were changed can't be redistributed or sold.
People who receive a finished work can use, place, and adjust it, but can't redistribute or resell this package
or any models or textures extracted from it. For details, see LICENSE.txt and the Terms of Service (${termsUrl()}).
`;
}

const termsUrl = () => `${siteUrl()}/terms`;

// 完成品を販売・配布したときに受け取った人も読めるよう、利用条件をパッケージに同梱する
function license(input: WorkPackageInput) {
  return `VRPrintLab 利用条件
==============================

作品名      : ${input.workName}
テンプレート: ${input.template.name}
取得 ID     : ${input.purchaseId}
利用規約    : ${termsUrl()}
規約の改定日: ${termsVersionLabel()}

このパッケージは VRPrintLab（${siteUrl()}）で作成されたものです。
ここに書いていないことは、上記の改定日の利用規約に従います。

■ 作成した人（VRPrintLab でこのパッケージをダウンロードした人）
- 完成品を VRChat の内外で利用できます。
- 自分が権利を持つ画像、または権利者から許諾を得た画像を貼った完成品は、BOOTH などで販売・無料配布できます。
  販売用のライセンスや売上の歩合は必要ありません。
- 次のものは再配布・販売できません。
  - 画像を貼っていない、未加工のテンプレート
  - 完成品から画像を外したモデル
  - 色を変えただけのモデル
  - テンプレート・ギミックを完成品から取り出して単体にしたもの
- 販売・配布するときは、受け取った人にも下の条件を守ってもらってください。

■ 完成品を受け取った人（購入者・配布を受けた人）
- VRChat などで、完成品を利用・配置・調整できます
  （ワールドへの配置、位置・大きさ・向きの調整、ギミックの設定値の変更などを含みます）。
- このパッケージ、およびパッケージから取り出したモデル・テクスチャ・スクリプトを、
  再配布・再販売することはできません。

■ 貼られた画像について
- 画像の権利は、その画像の権利者にあります。
- VRPrintLab の利用条件は、画像の権利者が元の画像を VRPrintLab とは別に利用することを制限しません。

${licenseEnglish(input)}`;
}

// LICENSE の英語の部分（参考訳。食い違いがあれば日本語が優先する）
function licenseEnglish(input: WorkPackageInput) {
  return `[English] (Reference translation. If there is any difference, the Japanese version above prevails.)

VRPrintLab Terms of Use
==============================

Work name     : ${input.workName}
Template      : ${input.template.nameEn || input.template.name}
Purchase ID   : ${input.purchaseId}
Terms         : ${termsUrl()}
Terms revised : ${termsVersionLabel("en")}

This package was created with VRPrintLab (${siteUrl()}).
Anything not stated here is governed by the Terms of Service as of the revision date above.

■ Creator (the person who downloaded this package from VRPrintLab)
- You may use the finished work both inside and outside VRChat.
- You may sell finished works on BOOTH and similar platforms, or distribute them for free, as long as they use images
  you own the rights to or have permission from the rights holder to use.
  No commercial license or revenue share is required.
- You may not redistribute or sell:
  - Unmodified templates without images
  - Models with the images removed from a finished work
  - Models where only the colors were changed
  - Templates or gimmicks extracted from a finished work on their own
- When selling or distributing, please have the recipients follow the conditions below.

■ Recipients of a finished work (purchasers and people who received it)
- You may use, place, and adjust the finished work in VRChat and similar platforms
  (including placing it in a world, adjusting its position, size, and rotation, and changing gimmick settings).
- You may not redistribute or resell this package, or any models, textures, or scripts extracted from it.

■ About the images used
- The rights to the images belong to their respective rights holders.
- These terms do not restrict the rights holders of the images from using the original images separately from VRPrintLab.
`;
}

export async function buildWorkPackage(input: WorkPackageInput) {
  const folder = input.packageName;
  const prefabName = folder;
  const base = `Assets/VRPrintLab/${folder}`;
  const assets: PackageAsset[] = [];
  const guidOf = (path: string) => deterministicGuid(input.purchaseId, path);
  const template = templateFiles({
    templatePackage: input.templatePackage,
    prefabPath: input.template.prefabPath,
    folder: `${base}/Template`,
    guidOf,
  });

  // テンプレートのマテリアルを書き換えて、色とプリントを反映する（つやなどの設定はテンプレートのまま）
  for (const slot of input.template.slots) {
    const slotParams = input.params.slots[slot.key];
    if (slot.type === "color" && slotParams?.kind === "color") {
      template.editMaterial(slot.material, (yaml) => setMaterialColor(yaml, slotParams.color));
    } else if (slot.type === "print" && slotParams?.kind === "print") {
      const image = slotParams.imageId ? (input.images.get(slotParams.imageId) ?? null) : null;
      const texturePath = `${base}/Tex_${slot.key}.png`;
      assets.push({
        path: texturePath,
        data: await renderPrintTexture(slot, slotParams, image, backgroundColor(slot, input.params)),
        meta: textureMeta,
      });
      template.editMaterial(slot.material, (yaml) => {
        const textured = setMainTexture(setMaterialColor(yaml, "#ffffff"), guidOf(texturePath));
        return slot.background === "transparent" ? setCutout(textured) : textured;
      });
    }
  }

  assets.push(...template.assets);
  assets.push(...(await workBuildAssets({ base, modelPath: template.prefabPath, prefabName, gimmicks: input.gimmicks })));
  assets.push(...runtimeAssets(input.gimmicks));
  assets.push({ path: `${base}/README.txt`, data: Buffer.from(readme(input, folder, prefabName), "utf8"), meta: textAssetMeta });
  assets.push({ path: `${base}/LICENSE.txt`, data: Buffer.from(license(input), "utf8"), meta: textAssetMeta });

  return buildUnityPackage(input.purchaseId, assets);
}
