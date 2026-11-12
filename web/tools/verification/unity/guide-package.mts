// 導入ガイドの撮影用: タペストリーの作品パッケージを 1 つ作る（一時的なスクリプト）
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { readUnityPackage, resolveTemplatePrefab } from "../src/lib/package/read-unitypackage.ts";
import { buildWorkPackage, packageBaseName } from "../src/lib/package/work-package.ts";
import { defaultParams, parseEditorParams } from "../src/lib/templates/params.ts";
import { templateManifestSchema } from "../src/lib/templates/schema.ts";

const OUT = process.argv[2];
const SLUG = "tapestry";
const manifest = templateManifestSchema.parse(JSON.parse(readFileSync(`templates/${SLUG}/template.json`, "utf8")));
const templatePackage = readFileSync(`templates/${SLUG}/${manifest.files.package}`);
const prefabPath = resolveTemplatePrefab(readUnityPackage(templatePackage), manifest.files.prefab);

const W = 1120, H = 2000, L = 680, CARD = 820, CY = 300;
const logo = await sharp(readFileSync("images/common/icons/VRPrintLab_icon.png")).resize(L, L, { fit: "contain", background: "#ffffff" }).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f2a4a"/><stop offset="0.55" stop-color="#16857f"/><stop offset="1" stop-color="#f2c14e"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="${(W - CARD) / 2}" y="${CY}" width="${CARD}" height="${CARD}" rx="80" fill="#ffffff"/>
  <text x="${W / 2}" y="1400" font-family="Arial, Helvetica, sans-serif" font-size="150" font-weight="700" fill="#ffffff" text-anchor="middle">VRPrintLab</text>
  <text x="${W / 2}" y="1550" font-family="Arial, Helvetica, sans-serif" font-size="80" fill="#ffffff" text-anchor="middle" letter-spacing="12">SAMPLE TAPESTRY</text>
  <text x="${W / 2}" y="1850" font-family="Arial, Helvetica, sans-serif" font-size="56" fill="#0f2a4a" text-anchor="middle" letter-spacing="6">VRCHAT EXHIBITION 2026</text>
</svg>`;
const image = await sharp(Buffer.from(svg)).composite([{ input: logo, left: (W - L) / 2, top: CY + (CARD - L) / 2 }]).png().toBuffer();
writeFileSync(OUT.replace(/\.unitypackage$/, "-art.png"), image);

const imageId = "22222222-2222-4222-8222-222222222222";
const printKey = manifest.slots.find((s) => s.type === "print")!.key;
const base = defaultParams(manifest.slots);
const params = parseEditorParams({ slots: { ...base.slots, [printKey]: { ...base.slots[printKey], imageId } } }, manifest.slots);
const createdAt = new Date("2026-11-12T14:30:00+09:00");
const file = await buildWorkPackage({
  purchaseId: "00000000-0000-4000-8000-00000000a001",
  workName: "サンプルのタペストリー",
  packageName: packageBaseName(SLUG, createdAt),
  template: { slug: manifest.slug, name: manifest.name, slots: manifest.slots, prefabPath },
  params,
  gimmicks: [],
  templatePackage,
  images: new Map([[imageId, image]]),
  createdAt,
});
writeFileSync(OUT, file);
console.log(`${packageBaseName(SLUG, createdAt)} → ${OUT}`);
