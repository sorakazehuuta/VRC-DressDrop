import "server-only";
import { isMaterial, isScript, readUnityPackage, unityMaterialName, type UnityPackageEntry } from "./read-unitypackage";
import type { PackageAsset } from "./unitypackage";

// テンプレートの unitypackage の中身（モデル・マテリアル・Prefab など）を、作品のフォルダの下に複製する。
// 作品ごとに GUID を振り直し、ファイル間の参照（Prefab → FBX、FBX → マテリアルなど）もすべて新しい GUID に書き換える。
// こうすると同じテンプレートの作品を何個読み込んでも、互いのマテリアル（色・プリント）を上書きしない

export type TemplateFiles = {
  assets: PackageAsset[];
  // 作品フォルダの下に置いたあとの Prefab のパス
  prefabPath: string;
  // スロットのマテリアルを書き換える（変更後の YAML を返す関数を渡す）
  editMaterial: (materialName: string, edit: (yaml: string) => string) => void;
};

const GUID_PATTERN = /guid: ([0-9a-f]{32})/g;

function commonFolder(paths: string[]) {
  const split = paths.map((p) => p.split("/").slice(0, -1));
  const first = split[0] ?? [];
  let n = first.length;
  for (const parts of split) {
    let i = 0;
    while (i < n && i < parts.length && parts[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join("/");
}

const isYaml = (data: Buffer) => data.subarray(0, 5).toString("ascii") === "%YAML";

export function templateFiles(opts: {
  templatePackage: Buffer;
  prefabPath: string;
  folder: string;
  guidOf: (path: string) => string;
}): TemplateFiles {
  const entries = readUnityPackage(opts.templatePackage).filter((e) => !isScript(e));
  const files = entries.filter((e) => e.asset);
  const root = commonFolder(files.map((e) => e.path));
  const relocate = (p: string) => `${opts.folder}/${root ? p.slice(root.length + 1) : p.replace(/^Assets\//, "")}`;
  // 共通フォルダ自体とその親のフォルダ項目は作品フォルダに置き換わるので含めない
  const kept = entries.filter((e) => e.asset || (root && e.path.startsWith(`${root}/`)));

  const guidMap = new Map<string, string>();
  for (const e of kept) guidMap.set(e.guid, opts.guidOf(relocate(e.path)));
  const remap = (text: string) => text.replace(GUID_PATTERN, (all, guid: string) => (guidMap.has(guid) ? `guid: ${guidMap.get(guid)}` : all));

  const assets = new Map<string, { entry: UnityPackageEntry; path: string; data: Buffer; meta: string }>();
  for (const e of kept) {
    const path = relocate(e.path);
    const data = e.asset ? (isYaml(e.asset) ? Buffer.from(remap(e.asset.toString("utf8")), "utf8") : e.asset) : Buffer.alloc(0);
    assets.set(e.guid, { entry: e, path, data, meta: remap(e.meta) });
  }

  const prefab = entries.find((e) => e.path === opts.prefabPath);
  if (!prefab) throw new Error(`テンプレートに Prefab がありません: ${opts.prefabPath}`);

  return {
    prefabPath: relocate(prefab.path),
    editMaterial(materialName, edit) {
      const target = [...assets.values()].find((a) => isMaterial(a.entry) && unityMaterialName(a.entry) === materialName);
      if (!target) throw new Error(`テンプレートにマテリアルがありません: ${materialName}`);
      target.data = Buffer.from(edit(target.data.toString("utf8")), "utf8");
    },
    get assets() {
      return [...assets.values()].map((a) => ({
        path: a.path,
        data: a.data,
        folder: a.entry.asset === null,
        // GUID は guidOf(path) と同じ値になる（buildUnityPackage がパスから決める）。.meta の guid 行も書き換え済み
        meta: () => a.meta,
      }));
    },
  };
}

// ---- マテリアル（.mat の YAML）の書き換え ----

const unityColor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => (v / 255).toFixed(4);
  return `{r: ${c((n >> 16) & 255)}, g: ${c((n >> 8) & 255)}, b: ${c(n & 255)}, a: 1}`;
};

// m_Colors の _Color（URP などは _BaseColor）を指定の色にする
export function setMaterialColor(yaml: string, hex: string) {
  const value = unityColor(hex);
  let found = false;
  let out = yaml.replace(/^(\s*- _(?:Base)?Color: )\{[^}]*\}/gm, (_, head: string) => {
    found = true;
    return `${head}${value}`;
  });
  if (!found) out = insertListItem(out, "m_Colors", () => `- _Color: ${value}`);
  return out;
}

// m_TexEnvs の _MainTex にテクスチャを割り当てる（タイリングは 1、オフセットは 0。プレビューと同じ貼り方にする）
export function setMainTexture(yaml: string, textureGuid: string) {
  const texture = `{fileID: 2800000, guid: ${textureGuid}, type: 3}`;
  const block = /^(\s*)- _MainTex:\s*\n\s*m_Texture: \{[^}]*\}\s*\n\s*m_Scale: \{[^}]*\}\s*\n\s*m_Offset: \{[^}]*\}/m;
  const match = block.exec(yaml);
  if (match) {
    const indent = match[1];
    return yaml.replace(
      block,
      `${indent}- _MainTex:\n${indent}    m_Texture: ${texture}\n${indent}    m_Scale: {x: 1, y: 1}\n${indent}    m_Offset: {x: 0, y: 0}`,
    );
  }
  return insertListItem(
    yaml,
    "m_TexEnvs",
    (indent) => `- _MainTex:\n${indent}    m_Texture: ${texture}\n${indent}    m_Scale: {x: 1, y: 1}\n${indent}    m_Offset: {x: 0, y: 0}`,
  );
}

// Standard シェーダーの「Cutout」（透明な部分を切り抜く）にする。すでに半透明（Fade / Transparent）ならそのまま
export function setCutout(yaml: string) {
  const mode = /^(\s*- _Mode: )([\d.]+)/m.exec(yaml);
  if (mode && Number(mode[2]) >= 2) return yaml;
  let out = mode ? yaml.replace(/^(\s*- _Mode: )[\d.]+/m, (_, head: string) => `${head}1`) : insertListItem(yaml, "m_Floats", () => "- _Mode: 1");
  out = out.replace(/^(\s*m_CustomRenderQueue: )-?\d+/m, (_, head: string) => `${head}2450`);
  if (/^\s*m_ValidKeywords:/m.test(out)) {
    if (!/^\s*- _ALPHATEST_ON\s*$/m.test(out)) {
      out = out.replace(/^(\s*)m_ValidKeywords: \[\]/m, "$1m_ValidKeywords:\n$1- _ALPHATEST_ON");
      out = out.replace(/^(\s*)m_ValidKeywords:\s*\n(?!\s*- _ALPHATEST_ON)/m, (all, indent: string) => `${all}${indent}- _ALPHATEST_ON\n`);
    }
  } else {
    // 古い形式のマテリアル（m_ShaderKeywords に空白区切りで並ぶ）
    out = out.replace(/^(\s*m_ShaderKeywords: )(.*)$/m, (all, head: string, list: string) =>
      list.includes("_ALPHATEST_ON") ? all : `${head}${[list.trim(), "_ALPHATEST_ON"].filter(Boolean).join(" ")}`,
    );
  }
  if (/^\s*stringTagMap: \{\}/m.test(out)) {
    out = out.replace(/^(\s*)stringTagMap: \{\}/m, "$1stringTagMap:\n$1  RenderType: TransparentCutout");
  } else if (/^\s*RenderType: \S+/m.test(out)) {
    out = out.replace(/^(\s*RenderType: )\S+/m, "$1TransparentCutout");
  }
  return out;
}

// m_SavedProperties の中のリスト（m_Colors など）に項目を足す。item にはリストの字下げが渡される
function insertListItem(yaml: string, key: string, item: (indent: string) => string) {
  const empty = new RegExp(`^( *)${key}: \\[\\]`, "m");
  const emptyMatch = empty.exec(yaml);
  if (emptyMatch) return yaml.replace(empty, () => `${emptyMatch[1]}${key}:\n${emptyMatch[1]}${item(emptyMatch[1])}`);
  const list = new RegExp(`^( *)${key}: *$`, "m");
  const listMatch = list.exec(yaml);
  if (listMatch) return yaml.replace(list, () => `${listMatch[1]}${key}:\n${listMatch[1]}${item(listMatch[1])}`);
  throw new Error(`マテリアルに ${key} がありません`);
}
