import "server-only";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// .unitypackage は「<guid>/asset」「<guid>/asset.meta」「<guid>/pathname」を並べた tar.gz

// guidSeed: 省略時は購入 ID。全作品で共通のファイル（スクリプトなど）は固定の値にする
// folder: フォルダ自体の項目（asset ファイルを持たない）
export type PackageAsset = { path: string; data: Buffer; meta: (guid: string) => string; guidSeed?: string; folder?: boolean };

// 同じ購入 ID からは毎回同じ GUID になるようにし、再ダウンロードしたものを入れ直しても重複せず上書きされるようにする
export function deterministicGuid(seed: string, path: string) {
  return createHash("md5").update(`${seed}:${path}`).digest("hex");
}

function tarHeader(name: string, size: number, mtime: number) {
  const header = Buffer.alloc(512);
  const nameBytes = Buffer.from(name, "utf8");
  if (nameBytes.length > 100) throw new Error(`tar のファイル名が長すぎます: ${name}`);
  nameBytes.copy(header, 0);
  header.write("0000644\0", 100, "ascii");
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  header.write(mtime.toString(8).padStart(11, "0") + "\0", 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write("0", 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return header;
}

function tar(entries: { name: string; data: Buffer }[]) {
  const mtime = Math.floor(Date.now() / 1000);
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(tarHeader(entry.name, entry.data.length, mtime), entry.data);
    const padding = (512 - (entry.data.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

export function buildUnityPackage(seed: string, assets: PackageAsset[]) {
  const entries = assets.flatMap((asset) => {
    const guid = deterministicGuid(asset.guidSeed ?? seed, asset.path);
    return [
      ...(asset.folder ? [] : [{ name: `${guid}/asset`, data: asset.data }]),
      { name: `${guid}/asset.meta`, data: Buffer.from(asset.meta(guid), "utf8") },
      { name: `${guid}/pathname`, data: Buffer.from(asset.path, "utf8") },
    ];
  });
  return gzipSync(tar(entries));
}

// ---- 各アセットの .meta / 中身 ----

export const textureMeta = (guid: string) => `fileFormatVersion: 2
guid: ${guid}
TextureImporter:
  serializedVersion: 12
  mipmaps:
    mipMapMode: 0
    enableMipMap: 1
    sRGBTexture: 1
  alphaIsTransparency: 1
  maxTextureSize: 2048
  textureType: 0
  textureShape: 1
  platformSettings:
  - serializedVersion: 3
    buildTarget: DefaultTexturePlatform
    maxTextureSize: 2048
    textureCompression: 1
  - serializedVersion: 3
    buildTarget: Android
    maxTextureSize: 2048
    textureCompression: 1
  userData:
  assetBundleName:
  assetBundleVariant:
`;

export const nativeAssetMeta = (guid: string) => `fileFormatVersion: 2
guid: ${guid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 2100000
  userData:
  assetBundleName:
  assetBundleVariant:
`;

export const textAssetMeta = (guid: string) => `fileFormatVersion: 2
guid: ${guid}
TextScriptImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

// FBX 内のマテリアルを、同梱したマテリアルに置き換える（シーンに置くだけで色とプリントが反映される）
export const modelMeta = (remap: { materialName: string; materialGuid: string }[]) => (guid: string) => `fileFormatVersion: 2
guid: ${guid}
ModelImporter:
  serializedVersion: 22200
  internalIDToNameTable: []
  externalObjects:
${remap
  .map(
    (r) => `  - first:
      type: UnityEngine:Material
      assembly: UnityEngine.CoreModule
      name: ${r.materialName}
    second: {fileID: 2100000, guid: ${r.materialGuid}, type: 2}`,
  )
  .join("\n")}
  materials:
    materialImportMode: 2
    materialName: 0
    materialSearch: 1
    materialLocation: 1
  importAnimation: 0
  userData:
  assetBundleName:
  assetBundleVariant:
`;

const color = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => (v / 255).toFixed(4);
  return `{r: ${c((n >> 16) & 255)}, g: ${c((n >> 8) & 255)}, b: ${c(n & 255)}, a: 1}`;
};

// Standard シェーダー（PC / Quest どちらのワールドでも使える組み込みシェーダー）のマテリアル
export function standardMaterial(opts: { name: string; color?: string; textureGuid?: string; cutout?: boolean }) {
  const cutout = Boolean(opts.cutout);
  return `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  serializedVersion: 8
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${opts.name}
  m_Shader: {fileID: 46, guid: 0000000000000000f000000000000000, type: 0}
  m_ValidKeywords:${cutout ? "\n  - _ALPHATEST_ON" : " []"}
  m_InvalidKeywords: []
  m_LightmapFlags: 4
  m_EnableInstancingVariants: 1
  m_DoubleSidedGI: 0
  m_CustomRenderQueue: ${cutout ? 2450 : -1}
  stringTagMap:${cutout ? "\n    RenderType: TransparentCutout" : " {}"}
  disabledShaderPasses: []
  m_SavedProperties:
    serializedVersion: 3
    m_TexEnvs:
    - _MainTex:
        m_Texture: ${opts.textureGuid ? `{fileID: 2800000, guid: ${opts.textureGuid}, type: 3}` : "{fileID: 0}"}
        m_Scale: {x: 1, y: 1}
        m_Offset: {x: 0, y: 0}
    m_Ints: []
    m_Floats:
    - _Cutoff: 0.5
    - _Glossiness: 0.3
    - _Metallic: 0
    - _Mode: ${cutout ? 1 : 0}
    - _SrcBlend: 1
    - _DstBlend: 0
    - _ZWrite: 1
    m_Colors:
    - _Color: ${color(opts.color ?? "#ffffff")}
  m_BuildTextureStacks: []
`;
}

// Windows のファイル名に使えない文字を除いた、フォルダ・ファイル名用の文字列
export function safeFileName(name: string, fallback: string) {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 50);
  return cleaned || fallback;
}
