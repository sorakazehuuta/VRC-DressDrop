import "server-only";
import { backgroundColor, type EditorParams } from "@/lib/templates/params";
import type { Slot } from "@/lib/templates/schema";
import { runtimeAssets, workBuildAssets, type GimmickInput } from "./gimmick-assets";
import { renderPrintTexture } from "./texture";
import {
  buildUnityPackage,
  deterministicGuid,
  modelMeta,
  nativeAssetMeta,
  safeFileName,
  standardMaterial,
  textAssetMeta,
  textureMeta,
  type PackageAsset,
} from "./unitypackage";

export type WorkPackageInput = {
  purchaseId: string;
  workName: string;
  template: { slug: string; name: string; slots: Slot[] };
  params: EditorParams;
  gimmicks: GimmickInput[];
  model: Buffer;
  images: Map<string, Buffer>;
  createdAt: Date;
};

export function packageFolderName(workName: string, purchaseId: string) {
  return `${safeFileName(workName, "Work")}_${purchaseId.slice(0, 8)}`;
}

function readme(input: WorkPackageInput, folder: string, prefabName: string) {
  const date = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(input.createdAt);
  const gimmickLines = input.gimmicks.length
    ? input.gimmicks.map((g) => `- ${g.def.name}：${g.def.description}${g.def.note ? `（${g.def.note}）` : ""}`).join("\n")
    : "なし";
  const needsUdon = input.gimmicks.some((g) => g.def.script);
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
マテリアルは Unity 標準の Standard シェーダーを使っているため、PC 版・Quest 版のどちらのワールドでも表示できます。
テクスチャの最大サイズは 2048px に設定しています。

■ 同梱ファイル
- ${prefabName}.prefab : シーンに置くもの（読み込み時に自動で作成）
- ${input.template.slug}.fbx : 3Dモデル
- Mat_*.mat / Tex_*.png : マテリアルとテクスチャ
- VRPrintLab.json : Prefab の組み立て設定
- Assets/VRPrintLab/_Runtime : Prefab の組み立てとギミックのスクリプト（ほかの作品と共通）

■ ご利用にあたって
作成したモデルは VRChat の内外で自由にお使いいただけます。
ただし、テンプレートの3Dモデルそのものを単体で再配布・販売することは禁止しています。
アップロードした画像の権利は、作成者ご本人が保証するものとします。
`;
}

export async function buildWorkPackage(input: WorkPackageInput) {
  const folder = packageFolderName(input.workName, input.purchaseId);
  const prefabName = safeFileName(input.workName, "Work");
  const base = `Assets/VRPrintLab/${folder}`;
  const assets: PackageAsset[] = [];
  const remap: { materialName: string; materialGuid: string }[] = [];
  const guidOf = (path: string) => deterministicGuid(input.purchaseId, path);

  for (const slot of input.template.slots) {
    const slotParams = input.params.slots[slot.key];
    const materialPath = `${base}/${slot.material}.mat`;

    if (slot.type === "color" && slotParams?.kind === "color") {
      assets.push({
        path: materialPath,
        data: Buffer.from(standardMaterial({ name: slot.material, color: slotParams.color }), "utf8"),
        meta: nativeAssetMeta,
      });
    } else if (slot.type === "print" && slotParams?.kind === "print") {
      const image = slotParams.imageId ? (input.images.get(slotParams.imageId) ?? null) : null;
      const texturePath = `${base}/Tex_${slot.key}.png`;
      assets.push({
        path: texturePath,
        data: await renderPrintTexture(slot, slotParams, image, backgroundColor(slot, input.params)),
        meta: textureMeta,
      });
      assets.push({
        path: materialPath,
        data: Buffer.from(
          standardMaterial({ name: slot.material, textureGuid: guidOf(texturePath), cutout: slot.background === "transparent" }),
          "utf8",
        ),
        meta: nativeAssetMeta,
      });
    } else {
      continue;
    }
    remap.push({ materialName: slot.material, materialGuid: guidOf(materialPath) });
  }

  const modelPath = `${base}/${input.template.slug}.fbx`;
  assets.push({ path: modelPath, data: input.model, meta: modelMeta(remap) });
  assets.push(...(await workBuildAssets({ base, workName: input.workName, modelPath, prefabName, gimmicks: input.gimmicks })));
  assets.push(...runtimeAssets());
  assets.push({ path: `${base}/README.txt`, data: Buffer.from(readme(input, folder, prefabName), "utf8"), meta: textAssetMeta });

  return buildUnityPackage(input.purchaseId, assets);
}
