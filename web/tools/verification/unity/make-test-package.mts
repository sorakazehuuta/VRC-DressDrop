// テスト用: 全ギミックを含む複数の作品の unitypackage を作り、1つにまとめる
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import sharp from "sharp";
import { gimmickDefinitionSchema, parseGimmickSelection, defaultGimmickParams, type GimmickDefinition } from "../src/lib/gimmicks/schema.ts";
import { buildWorkPackage } from "../src/lib/package/work-package.ts";
import { defaultParams, parseEditorParams } from "../src/lib/templates/params.ts";
import { templateManifestSchema } from "../src/lib/templates/schema.ts";

const OUT = process.argv[2];
const defs = new Map<string, GimmickDefinition>(
  readdirSync("gimmicks/catalog").map((f) => {
    const d = gimmickDefinitionSchema.parse(JSON.parse(readFileSync(`gimmicks/catalog/${f}`, "utf8")));
    return [d.slug, d];
  }),
);
const manifest = templateManifestSchema.parse(JSON.parse(readFileSync("templates/tshirt/template.json", "utf8")));
const model = readFileSync("templates/tshirt/model.fbx");
const imageId = "11111111-1111-4111-8111-111111111111";
const image = await sharp(readFileSync("images/common/icons/VRPrintLab_icon.png")).png().toBuffer();

const works: [string, string, string[]][] = [
  ["G01 パーティクル切替と常時発光と魔法陣", "#f9a8d4", ["toggle-particles", "glow", "magic-circle"]],
  ["G02 回転とライト切替と近づくと光る", "#38bdf8", ["spin", "toggle-light", "glow-on-approach"]],
  ["G03 段階回転と触れると光るとパーティクル", "#16a34a", ["step-rotate", "glow-on-touch", "particles"]],
  ["G04 スイッチ表示切替と触れると揺れる", "#facc15", ["toggle-visibility", "sway-on-touch"]],
  ["G05 持てる物理あり軌跡", "#ffffff", ["pickup", "trail"]],
  ["G06 振るとキラキラと軌跡", "#dc2626", ["shake-sparkle", "trail"]],
  ["G07 ついてくると魔法陣", "#1e3a8a", ["follow", "magic-circle"]],
  ["G08 半透明切替と回転", "#f97316", ["toggle-transparency", "spin"]],
  ["G09 ギミックなし", "#6b7280", []],
];

const tars: Buffer[] = [];
let i = 0;
for (const [name, color, slugs] of works) {
  const raw = slugs.map((slug) => ({ slug, params: { ...defaultGimmickParams(defs.get(slug)!), ...(slug === "pickup" ? { physics: true } : {}) } }));
  const gimmicks = parseGimmickSelection(raw, defs);
  if (gimmicks.length !== slugs.length) throw new Error(`${name}: 組み合わせが不正（${gimmicks.map((g) => g.slug)}）`);
  const params = parseEditorParams(
    { slots: { ...defaultParams(manifest.slots).slots, base: { kind: "color", color }, print: { ...defaultParams(manifest.slots).slots.print, imageId, scaleX: 0.7, scaleY: 0.7 } } },
    manifest.slots,
  );
  const file = await buildWorkPackage({
    purchaseId: `00000000-0000-4000-8000-${String(++i).padStart(12, "0")}`,
    workName: name,
    template: { slug: manifest.slug, name: manifest.name, slots: manifest.slots },
    params,
    gimmicks: gimmicks.map((g) => ({ def: defs.get(g.slug)!, params: g.params })),
    model,
    images: new Map([[imageId, image]]),
    createdAt: new Date(),
  });
  tars.push(gunzipSync(file));
}

// tar をつなげる（末尾の空ブロックを除き、同じ GUID の項目は1つにする）
const seen = new Set<string>();
const chunks: Buffer[] = [];
for (const tar of tars) {
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar.toString("utf8", off, off + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(tar.toString("ascii", off + 124, off + 136).replace(/\0.*$/s, "").trim(), 8);
    const total = 512 + Math.ceil(size / 512) * 512;
    if (!seen.has(name)) {
      seen.add(name);
      chunks.push(tar.subarray(off, off + total));
    }
    off += total;
  }
}
chunks.push(Buffer.alloc(1024));
writeFileSync(OUT, gzipSync(Buffer.concat(chunks)));
console.log(`作品 ${works.length} 件 / エントリ ${seen.size} 件 → ${OUT}`);
