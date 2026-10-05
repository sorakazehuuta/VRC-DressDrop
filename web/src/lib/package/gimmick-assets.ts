import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { magicCircleSvg } from "@/lib/gimmicks/magic-circle";
import type { GimmickDefinition, GimmickParamValue } from "@/lib/gimmicks/schema";
import { deterministicGuid, textAssetMeta, textureMeta, type PackageAsset } from "./unitypackage";

// Unity 用のスクリプト（web/gimmicks/unity）。next.config.ts の outputFileTracingIncludes で本番にも同梱する
const UNITY_DIR = path.join(process.cwd(), "gimmicks", "unity");
export const RUNTIME_FOLDER = "Assets/VRPrintLab/_Runtime";

// 共通スクリプトは全作品で同じ場所・同じ GUID にする（クラスの重複を防ぎ、新しい版で上書き更新されるように）
const RUNTIME_GUID_SEED = "vrprintlab-runtime";

const monoScriptMeta = (guid: string) => `fileFormatVersion: 2
guid: ${guid}
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

const folderMeta = (guid: string) => `fileFormatVersion: 2
guid: ${guid}
folderAsset: yes
DefaultImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

let cachedScripts: { path: string; data: Buffer }[] | null = null;

function unityScripts() {
  if (cachedScripts) return cachedScripts;
  const result: { path: string; data: Buffer }[] = [];
  for (const [dir, target] of [
    ["Runtime", `${RUNTIME_FOLDER}/Scripts`],
    ["Editor", `${RUNTIME_FOLDER}/Editor`],
  ]) {
    for (const file of readdirSync(path.join(UNITY_DIR, dir)).filter((f) => f.endsWith(".cs")).sort()) {
      result.push({ path: `${target}/${file}`, data: readFileSync(path.join(UNITY_DIR, dir, file)) });
    }
  }
  cachedScripts = result;
  return result;
}

// Prefab の自動組み立てスクリプトと、ギミックのスクリプト一式
export function runtimeAssets(): PackageAsset[] {
  const scripts = unityScripts();
  const folders = [RUNTIME_FOLDER, `${RUNTIME_FOLDER}/Scripts`, `${RUNTIME_FOLDER}/Editor`];
  return [
    ...folders.map((folder) => ({ path: folder, data: Buffer.alloc(0), meta: folderMeta, folder: true, guidSeed: RUNTIME_GUID_SEED })),
    ...scripts.map((s) => ({ path: s.path, data: s.data, meta: monoScriptMeta, guidSeed: RUNTIME_GUID_SEED })),
  ];
}

// 足元の魔法陣（白で描き、Unity 側のマテリアルで色を付ける）。図形はエディタのプレビューと共通
async function magicCircleTexture() {
  return sharp(Buffer.from(magicCircleSvg(1024))).png().toBuffer();
}

export type GimmickInput = { def: GimmickDefinition; params: Record<string, GimmickParamValue> };

function paramEntry(key: string, type: string, value: GimmickParamValue) {
  return { key, type, value: typeof value === "boolean" ? (value ? "true" : "false") : String(value) };
}

// Unity 側の VRPrintLabPrefabBuilder が読む組み立て設定と、それに必要な素材
export async function workBuildAssets(opts: {
  base: string;
  workName: string;
  modelPath: string;
  prefabName: string;
  gimmicks: GimmickInput[];
}): Promise<PackageAsset[]> {
  const assets: PackageAsset[] = [];
  let magicCirclePath = "";
  if (opts.gimmicks.some((g) => g.def.setup.includes("magic-circle"))) {
    magicCirclePath = `${opts.base}/Tex_magic_circle.png`;
    assets.push({ path: magicCirclePath, data: await magicCircleTexture(), meta: textureMeta });
  }

  const config = {
    version: 1,
    name: opts.workName,
    folder: opts.base,
    modelPath: opts.modelPath,
    prefabPath: `${opts.base}/${opts.prefabName}.prefab`,
    magicCircleTexturePath: magicCirclePath,
    gimmicks: opts.gimmicks.map(({ def, params }) => ({
      slug: def.slug,
      name: def.name,
      script: def.script ?? "",
      setup: def.setup,
      params: [
        ...def.params.map((p) => paramEntry(p.key, p.type, params[p.key] ?? p.default)),
        ...Object.entries(def.fixed).map(([key, value]) => paramEntry(key, typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "select", value)),
      ],
    })),
  };
  assets.push({ path: `${opts.base}/VRPrintLab.json`, data: Buffer.from(JSON.stringify(config, null, 2), "utf8"), meta: textAssetMeta });
  return assets;
}

export const runtimeGuid = (assetPath: string) => deterministicGuid(RUNTIME_GUID_SEED, assetPath);
