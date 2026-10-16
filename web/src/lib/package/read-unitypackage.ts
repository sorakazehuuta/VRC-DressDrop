import { gunzipSync } from "node:zlib";

// .unitypackage（tar.gz）を読む。サーバーの unitypackage 生成と、テンプレートの登録スクリプトの両方から使うため
// "server-only" や "@/..." を import しないこと

export type UnityPackageEntry = {
  guid: string;
  // Assets/... から始まる Unity 上のパス
  path: string;
  // フォルダの項目は asset を持たない
  asset: Buffer | null;
  meta: string;
};

function readString(buf: Buffer, start: number, length: number) {
  const end = buf.indexOf(0, start);
  return buf.toString("utf8", start, end >= 0 && end < start + length ? end : start + length);
}

function untar(data: Buffer) {
  const files = new Map<string, Buffer>();
  let offset = 0;
  let longName: string | null = null;
  let paxPath: string | null = null;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(readString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = readString(header, 345, 155);
    let name = readString(header, 0, 100);
    if (prefix) name = `${prefix}/${name}`;
    const body = data.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === "L") {
      longName = readString(body, 0, body.length);
      continue;
    }
    if (type === "x") {
      // PAX 拡張ヘッダー（長いパス）
      const match = /\d+ path=([^\n]*)\n/.exec(body.toString("utf8"));
      paxPath = match ? match[1] : null;
      continue;
    }
    if (type === "g") continue;
    name = paxPath ?? longName ?? name;
    longName = null;
    paxPath = null;
    if (type === "0" || type === "\0" || type === "7") files.set(name.replace(/^\.\//, ""), Buffer.from(body));
  }
  return files;
}

export function readUnityPackage(data: Buffer): UnityPackageEntry[] {
  let tar: Buffer;
  try {
    tar = gunzipSync(data);
  } catch {
    throw new Error("unitypackage として読めませんでした（gzip 形式ではありません）");
  }
  const files = untar(tar);
  const guids = new Set([...files.keys()].map((name) => name.split("/")[0]).filter((g) => /^[0-9a-f]{32}$/.test(g)));
  const entries: UnityPackageEntry[] = [];
  for (const guid of guids) {
    const pathname = files.get(`${guid}/pathname`);
    const meta = files.get(`${guid}/asset.meta`);
    if (!pathname || !meta) continue;
    // pathname の2行目以降には古い Unity が付けた付加情報が入ることがある
    const path = pathname.toString("utf8").split("\n")[0].trim();
    entries.push({ guid, path, asset: files.get(`${guid}/asset`) ?? null, meta: meta.toString("utf8") });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

// Unity のマテリアル（.mat）の名前。ファイル名ではなく中の m_Name を使う（"•" のような書き方も戻す）
export function unityMaterialName(entry: UnityPackageEntry) {
  if (!entry.asset) return null;
  const match = /^ {2}m_Name: (.*)$/m.exec(entry.asset.toString("utf8"));
  if (!match) return null;
  const raw = match[1].trim();
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

export const isMaterial = (e: UnityPackageEntry) => e.asset !== null && e.path.toLowerCase().endsWith(".mat");
export const isPrefab = (e: UnityPackageEntry) => e.asset !== null && e.path.toLowerCase().endsWith(".prefab");
export const isModel = (e: UnityPackageEntry) => e.asset !== null && /\.(fbx|obj|blend|dae)$/i.test(e.path);
// テンプレートに入れてはいけないもの（購入者のプロジェクトでコードが動く・他の作品と衝突する）
export const isScript = (e: UnityPackageEntry) => /\.(cs|dll|js|asmdef|asmref)$/i.test(e.path);

// template.json で指定がなければ、パッケージ内のただ1つの Prefab（なければただ1つのモデル）を使う
export function resolveTemplatePrefab(entries: UnityPackageEntry[], specified?: string) {
  if (specified) {
    const hit = entries.find((e) => e.asset && e.path === specified);
    if (!hit) throw new Error(`files.prefab の "${specified}" が unitypackage の中にありません`);
    return hit.path;
  }
  const prefabs = entries.filter(isPrefab);
  if (prefabs.length === 1) return prefabs[0].path;
  if (prefabs.length > 1) {
    throw new Error(`unitypackage に Prefab が複数あります。template.json の files.prefab で使うものを指定してください（${prefabs.map((p) => p.path).join(", ")}）`);
  }
  const models = entries.filter(isModel);
  if (models.length === 1) return models[0].path;
  throw new Error("unitypackage に Prefab がありません。Unity で Prefab を作ってから書き出してください");
}
