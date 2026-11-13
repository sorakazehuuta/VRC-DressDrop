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

// 端を繰り返さない（Clamp）プリントのテクスチャ。アクリルの板のように、面の下端まで描いた絵（差し込む帯）が
// 上端ににじまないようにする（ブラウザのプレビューの CanvasTexture も Clamp）
export const clampedTextureMeta = (guid: string) =>
  textureMeta(guid).replace(
    "  textureShape: 1\n",
    "  textureShape: 1\n  textureSettings:\n    serializedVersion: 2\n    filterMode: 1\n    aniso: 1\n    mipBias: 0\n    wrapU: 1\n    wrapV: 1\n    wrapW: 1\n",
  );

export const textAssetMeta = (guid: string) => `fileFormatVersion: 2
guid: ${guid}
TextScriptImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;
