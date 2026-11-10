// templates/<slug>/template.json を検証し、unitypackage とプレビュー用モデルを Supabase Storage にアップロードして templates テーブルへ登録する。
//   npm run templates:check            … 検証のみ（Supabase には何もしない）
//   npm run templates:sync             … 全テンプレートを登録・更新
//   npm run templates:sync -- cake     … 指定したテンプレートだけ
// プレビュー用モデル（preview.glb）は先に npm run templates:prepare で作っておく
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isMaterial, isScript, resolveTemplatePrefab, unityMaterialName } from "../src/lib/package/read-unitypackage";
import type { TemplateManifest } from "../src/lib/templates/schema";
import { readGlbJson, readTemplateFolder, sha256, templateSlugs } from "./template-bake/template-files";

const QUEST_TRIANGLE_LIMIT = 10_000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));

type Loaded = {
  slug: string;
  dir: string;
  manifest: TemplateManifest | null;
  prefab: string;
  packageFile: string;
  errors: string[];
  warnings: string[];
};

function load(slug: string): Loaded {
  const folder = readTemplateFolder(slug);
  if (!folder.ok) return { slug, dir: folder.dir, manifest: null, prefab: "", packageFile: "", errors: folder.errors, warnings: [] };
  const { dir, manifest, entries, packageData, packageFile } = folder;
  const errors: string[] = [];
  const warnings: string[] = [];
  const result = () => ({ slug, dir, manifest, prefab, packageFile, errors, warnings });

  let prefab = "";
  try {
    prefab = resolveTemplatePrefab(entries, manifest.files.prefab);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  const scripts = entries.filter(isScript);
  if (scripts.length) errors.push(`unitypackage にスクリプトが含まれています。テンプレートには入れられません（${scripts.map((s) => s.path).join(", ")}）`);

  // 購入時の unitypackage では、スロットのマテリアル（.mat）の色・テクスチャを書き換える
  const materials = entries.filter(isMaterial);
  const materialNames = materials.map(unityMaterialName);
  for (const slot of manifest.slots) {
    const count = materialNames.filter((n) => n === slot.material).length;
    if (count === 0) {
      errors.push(
        `スロット "${slot.key}" のマテリアル "${slot.material}" が unitypackage にありません（.mat: ${materialNames.join(", ") || "なし"}）。FBX に埋め込まれたマテリアルは Unity の Materials タブで Extract Materials してから書き出してください`,
      );
    } else if (count > 1) {
      errors.push(`スロット "${slot.key}" のマテリアル "${slot.material}" と同じ名前の .mat が複数あります。名前を変えて区別してください`);
    }
  }

  const previewFile = path.join(dir, manifest.files.preview);
  if (!existsSync(previewFile)) {
    errors.push(`プレビュー用モデル "${manifest.files.preview}" がありません。npm run templates:prepare -- ${slug} で作ってください`);
    return result();
  }
  const glb = readGlbJson(previewFile);
  const source = glb.asset.extras?.vrprintlab;
  if (!source || source.sourceSha256 !== sha256(packageData) || source.prefab !== prefab) {
    errors.push(`"${manifest.files.preview}" が今の unitypackage から作られたものではありません。npm run templates:prepare -- ${slug} で作り直してください`);
  }

  const glbMaterials = (glb.materials ?? []).map((m) => m.name ?? "");
  let triangles = 0;
  for (const mesh of glb.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const count = prim.indices !== undefined ? glb.accessors[prim.indices].count : glb.accessors[prim.attributes.POSITION].count;
      triangles += count / 3;
    }
  }
  for (const slot of manifest.slots) {
    const index = glbMaterials.indexOf(slot.material);
    if (index < 0) {
      // .mat はあるが Prefab のどこにも使われていない
      if (materialNames.includes(slot.material)) {
        errors.push(`スロット "${slot.key}" のマテリアル "${slot.material}" が Prefab で表示されている面に使われていません`);
      }
      continue;
    }
    if (slot.type === "print") {
      const prims = (glb.meshes ?? []).flatMap((m) => m.primitives).filter((p) => p.material === index);
      if (prims.some((p) => p.attributes.TEXCOORD_0 === undefined)) {
        errors.push(`プリントスロット "${slot.key}" の面に UV がありません。UV 展開したモデルを使ってください`);
      }
    }
  }
  if (triangles > QUEST_TRIANGLE_LIMIT) {
    warnings.push(`ポリゴン数 ${Math.round(triangles)} が Quest の目安（${QUEST_TRIANGLE_LIMIT}）を超えています`);
  }
  return result();
}

function hashedName(file: string) {
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
  return `${hash}${path.extname(file).toLowerCase()}`;
}

const contentTypes: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".unitypackage": "application/gzip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  const loaded = templateSlugs(only).map(load);
  let failed = false;
  for (const t of loaded) {
    const status = t.errors.length ? "NG" : "OK";
    console.log(`[${status}] ${t.slug}${t.manifest?.name ? ` (${t.manifest.name})` : ""}`);
    if (t.prefab) console.log(`   Prefab: ${t.prefab}`);
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

  // トークン数・公開状態・並び順・読みは、登録済みなら DB の値（管理画面で変えた値）を残す。template.json の値は初回の登録だけに使う
  const { data: registered } = await supabase.from("templates").select("slug, sort_order");
  const registeredSlugs = new Set((registered ?? []).map((t) => t.slug));
  // 新しく登録するものは、管理画面で並べた順番を崩さないよう最後に並べる（新しいもの同士は sortOrder の順）
  const lastSortOrder = Math.max(0, ...(registered ?? []).map((t) => t.sort_order));
  const newSortOrders = new Map(
    loaded
      .flatMap(({ manifest }) => (manifest && !registeredSlugs.has(manifest.slug) ? [manifest] : []))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m, i) => [m.slug, lastSortOrder + (i + 1) * 10]),
  );

  for (const { dir, manifest, prefab, packageFile } of loaded) {
    if (!manifest) continue;
    const isNew = !registeredSlugs.has(manifest.slug);
    const previewPath = await upload("template-assets", manifest.slug, path.join(dir, manifest.files.preview));
    const packagePath = await upload("template-packages", manifest.slug, packageFile);
    // template.json で指定がなければ、templates:thumbnails が自動生成した thumbnail.png を使う
    const thumbnailFile = manifest.files.thumbnail ?? (existsSync(path.join(dir, "thumbnail.png")) ? "thumbnail.png" : null);
    const thumbnailPath = thumbnailFile ? await upload("template-assets", manifest.slug, path.join(dir, thumbnailFile)) : null;
    if (!thumbnailFile) console.log(`   注意: ${manifest.slug} にサムネイルがありません（npm run templates:thumbnails で作れます）`);

    // 登録済みの行は update にする（upsert は NOT NULL の列を省けない）
    const row = {
      slug: manifest.slug,
      name: manifest.name,
      category: manifest.category,
      description: manifest.description,
      preview_model_path: previewPath,
      package_model_path: packagePath,
      package_prefab_path: prefab,
      thumbnail_path: thumbnailPath,
      slots: manifest.slots,
    };
    const { error } = isNew
      ? await supabase.from("templates").insert({ ...row, token_cost: manifest.tokenCost, is_public: manifest.isPublic, sort_order: newSortOrders.get(manifest.slug), name_reading: manifest.nameReading })
      : await supabase.from("templates").update(row).eq("slug", manifest.slug);
    if (error) {
      const hint = error.message.includes("package_prefab_path") ? "（マイグレーション 20261016000000_unitypackage_templates.sql を SQL Editor で実行してください）" : "";
      throw new Error(`${manifest.slug} の登録に失敗: ${error.message}${hint}`);
    }
    console.log(
      isNew
        ? `登録しました: ${manifest.slug}（${manifest.isPublic ? "公開" : "非公開"}）`
        : `更新しました: ${manifest.slug}（トークン数・公開状態・並び順・読みは管理画面の値のまま）`,
    );
  }
}

main().catch((e) => {
  console.error(`\n失敗しました: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
