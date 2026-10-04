import "server-only";
import { backgroundColor, type EditorParams } from "@/lib/templates/params";
import type { Slot } from "@/lib/templates/schema";
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
  model: Buffer;
  images: Map<string, Buffer>;
  createdAt: Date;
};

export function packageFolderName(workName: string, purchaseId: string) {
  return `${safeFileName(workName, "Work")}_${purchaseId.slice(0, 8)}`;
}

function readme(input: WorkPackageInput, folder: string) {
  const date = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(input.createdAt);
  return `VRPrintLab で作成したモデル
==============================

作品名      : ${input.workName}
テンプレート: ${input.template.name}
作成日時    : ${date}

■ 使い方
1. VRChat Creator Companion（VCC）または ALCOM で作成したワールドプロジェクトを Unity で開きます。
2. この unitypackage を Unity のウィンドウにドラッグ＆ドロップし、「Import」を押します。
3. Project ウィンドウの Assets/VRPrintLab/${folder}/ にある ${input.template.slug}.fbx を、
   Hierarchy（シーン）にドラッグして配置します。色とプリントは設定済みです。
4. 位置・向き・大きさを調整して、ワールドをアップロードします。

■ PC / Quest について
マテリアルは Unity 標準の Standard シェーダーを使っているため、PC 版・Quest 版のどちらのワールドでも表示できます。
テクスチャの最大サイズは 2048px に設定しています。

■ 同梱ファイル
- ${input.template.slug}.fbx : 3Dモデル
- Mat_*.mat          : マテリアル（色・プリント）
- Tex_*.png          : プリントのテクスチャ
- README.txt         : このファイル

■ ご利用にあたって
作成したモデルは VRChat の内外で自由にお使いいただけます。
ただし、テンプレートの3Dモデルそのものを単体で再配布・販売することは禁止しています。
アップロードした画像の権利は、作成者ご本人が保証するものとします。
`;
}

export async function buildWorkPackage(input: WorkPackageInput) {
  const folder = packageFolderName(input.workName, input.purchaseId);
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

  assets.push({ path: `${base}/${input.template.slug}.fbx`, data: input.model, meta: modelMeta(remap) });
  assets.push({ path: `${base}/README.txt`, data: Buffer.from(readme(input, folder), "utf8"), meta: textAssetMeta });

  return buildUnityPackage(input.purchaseId, assets);
}
