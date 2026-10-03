// templates/<slug>/template.json を検証し、モデルを Supabase Storage にアップロードして templates テーブルへ登録する。
//   npm run templates:check            … 検証のみ（Supabase には何もしない）
//   npm run templates:sync             … 全テンプレートを登録・更新
//   npm run templates:sync -- tshirt   … 指定したテンプレートだけ
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { templateManifestSchema, type TemplateManifest } from "../src/lib/templates/schema";

z.config(z.locales.ja());

const TEMPLATES_DIR = path.join(import.meta.dirname, "..", "templates");
const QUEST_TRIANGLE_LIMIT = 10_000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));

type Loaded = { dir: string; manifest: TemplateManifest; errors: string[]; warnings: string[] };

function readGlbJson(file: string) {
  const buf = readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error("glb ファイルではありません");
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + jsonLength)) as {
    materials?: { name?: string }[];
    meshes?: { primitives: { material?: number; indices?: number; attributes: Record<string, number> }[] }[];
    accessors: { count: number }[];
  };
}

function load(slug: string): Loaded {
  const dir = path.join(TEMPLATES_DIR, slug);
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = JSON.parse(readFileSync(path.join(dir, "template.json"), "utf8"));
  const parsed = templateManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`template.json の ${issue.path.join(".") || "(全体)"}: ${issue.message}`);
    return { dir, manifest: raw, errors, warnings };
  }
  const manifest = parsed.data;
  if (manifest.slug !== slug) errors.push(`フォルダ名 "${slug}" と slug "${manifest.slug}" を一致させてください`);

  for (const [kind, file] of Object.entries(manifest.files)) {
    if (file && !existsSync(path.join(dir, file))) errors.push(`files.${kind} のファイル "${file}" がありません`);
  }
  if (errors.length) return { dir, manifest, errors, warnings };

  const glb = readGlbJson(path.join(dir, manifest.files.preview));
  const materialNames = (glb.materials ?? []).map((m) => m.name ?? "");
  let triangles = 0;
  for (const mesh of glb.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const count = prim.indices !== undefined ? glb.accessors[prim.indices].count : glb.accessors[prim.attributes.POSITION].count;
      triangles += count / 3;
    }
  }
  for (const slot of manifest.slots) {
    const index = materialNames.indexOf(slot.material);
    if (index < 0) {
      errors.push(`スロット "${slot.key}" のマテリアル "${slot.material}" が glb にありません（glb 内: ${materialNames.join(", ") || "なし"}）`);
      continue;
    }
    if (slot.type === "print") {
      const prims = (glb.meshes ?? []).flatMap((m) => m.primitives).filter((p) => p.material === index);
      if (prims.some((p) => p.attributes.TEXCOORD_0 === undefined)) {
        errors.push(`プリントスロット "${slot.key}" の面に UV がありません。Blender で UV 展開してから書き出してください`);
      }
    }
  }
  if (triangles > QUEST_TRIANGLE_LIMIT) {
    warnings.push(`ポリゴン数 ${Math.round(triangles)} が Quest の目安（${QUEST_TRIANGLE_LIMIT}）を超えています`);
  }

  const fbx = readFileSync(path.join(dir, manifest.files.package)).toString("latin1");
  for (const slot of manifest.slots) {
    if (!fbx.includes(slot.material)) errors.push(`スロット "${slot.key}" のマテリアル "${slot.material}" が fbx にありません`);
  }
  return { dir, manifest, errors, warnings };
}

function hashedName(file: string) {
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
  return `${hash}${path.extname(file).toLowerCase()}`;
}

const contentTypes: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  const slugs = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(TEMPLATES_DIR, d.name, "template.json")))
    .map((d) => d.name)
    .filter((s) => only.length === 0 || only.includes(s));
  if (slugs.length === 0) throw new Error("対象のテンプレートが見つかりません");

  const loaded = slugs.map(load);
  let failed = false;
  for (const t of loaded) {
    const status = t.errors.length ? "NG" : "OK";
    console.log(`[${status}] ${path.basename(t.dir)}${t.manifest?.name ? ` (${t.manifest.name})` : ""}`);
    for (const e of t.errors) console.log(`   エラー: ${e}`);
    for (const w of t.warnings) console.log(`   注意: ${w}`);
    if (t.errors.length) failed = true;
  }
  if (failed) {
    console.log("\nエラーを直してから再実行してください。Supabase には何も登録していません。");
    process.exit(1);
  }
  if (dryRun) {
    console.log("\n検証のみ実行しました（--dry-run）。");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  async function upload(bucket: string, slug: string, file: string) {
    const name = `${slug}/${hashedName(file)}`;
    const { error } = await supabase.storage.from(bucket).upload(name, readFileSync(file), {
      contentType: contentTypes[path.extname(file).toLowerCase()],
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) throw new Error(`${bucket}/${name} のアップロードに失敗: ${error.message}`);
    return name;
  }

  for (const { dir, manifest } of loaded) {
    const previewPath = await upload("template-assets", manifest.slug, path.join(dir, manifest.files.preview));
    const packagePath = await upload("template-packages", manifest.slug, path.join(dir, manifest.files.package));
    const thumbnailPath = manifest.files.thumbnail
      ? await upload("template-assets", manifest.slug, path.join(dir, manifest.files.thumbnail))
      : null;

    const { error } = await supabase.from("templates").upsert(
      {
        slug: manifest.slug,
        name: manifest.name,
        category: manifest.category,
        description: manifest.description,
        token_cost: manifest.tokenCost,
        is_public: manifest.isPublic,
        sort_order: manifest.sortOrder,
        preview_model_path: previewPath,
        package_model_path: packagePath,
        thumbnail_path: thumbnailPath,
        slots: manifest.slots,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`${manifest.slug} の登録に失敗: ${error.message}`);
    console.log(`登録しました: ${manifest.slug}（${manifest.isPublic ? "公開" : "非公開"}）`);
  }
}

main().catch((e) => {
  console.error(`\n失敗しました: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
