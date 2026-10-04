// gimmicks/catalog/*.json を検証し、gimmicks テーブルへ登録する。
//   npm run gimmicks:check   … 検証のみ（Supabase には何もしない）
//   npm run gimmicks:sync    … 登録・更新。catalog から消したギミックは非公開にする（使っている作品を壊さないため削除はしない）
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { gimmickDefinitionSchema, type GimmickDefinition } from "../src/lib/gimmicks/schema";

z.config(z.locales.ja());

const ROOT = path.join(import.meta.dirname, "..");
const CATALOG = path.join(ROOT, "gimmicks", "catalog");
const RUNTIME = path.join(ROOT, "gimmicks", "unity", "Runtime");
const dryRun = process.argv.includes("--dry-run");

function load() {
  const errors: string[] = [];
  const defs: GimmickDefinition[] = [];
  for (const file of readdirSync(CATALOG).filter((f) => f.endsWith(".json")).sort()) {
    const raw = JSON.parse(readFileSync(path.join(CATALOG, file), "utf8"));
    const parsed = gimmickDefinitionSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${file} の ${issue.path.join(".") || "(全体)"}: ${issue.message}`);
      continue;
    }
    const def = parsed.data;
    if (`${def.slug}.json` !== file) errors.push(`${file}: ファイル名と slug "${def.slug}" を一致させてください`);
    if (def.script) {
      const scriptFile = path.join(RUNTIME, `${def.script}.cs`);
      if (!existsSync(scriptFile)) {
        errors.push(`${file}: スクリプト gimmicks/unity/Runtime/${def.script}.cs がありません`);
      } else {
        // スクリプトにない設定項目は Unity 側で無視されるので、組み立て手順で使うもの以外は警告する
        const source = readFileSync(scriptFile, "utf8");
        const usedBySetup = new Set(["color", "amount", "startOn", "intensity", "range", "time", "width", "opacity", "glowColor", "size", "spinSpeed", "physics"]);
        for (const p of [...def.params.map((x) => x.key), ...Object.keys(def.fixed)]) {
          if (!new RegExp(`public\\s+[\\w\\[\\]]+\\s+${p}\\b`).test(source) && !usedBySetup.has(p)) {
            errors.push(`${file}: 設定項目 "${p}" が ${def.script}.cs の public フィールドにありません`);
          }
        }
      }
    }
    defs.push(def);
  }
  const slugs = new Set(defs.map((d) => d.slug));
  for (const def of defs) {
    for (const r of def.requiresAny) if (!slugs.has(r)) errors.push(`${def.slug}.json: requiresAny の "${r}" が見つかりません`);
  }
  return { defs, errors };
}

async function main() {
  const { defs, errors } = load();
  for (const def of defs) console.log(`  ${def.tokenCost} トークン  ${def.name}（${def.slug}）${def.isPublic ? "" : " ※非公開"}`);
  if (errors.length) {
    console.log("");
    for (const e of errors) console.log(`エラー: ${e}`);
    console.log("\nエラーを直してから再実行してください。Supabase には何も登録していません。");
    process.exit(1);
  }
  console.log(`\n${defs.length} 件のギミック定義に問題はありません。`);
  if (dryRun) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { error } = await supabase.from("gimmicks").upsert(
    defs.map((d) => ({
      slug: d.slug,
      name: d.name,
      category: d.category,
      description: d.description,
      script_path: d.script,
      token_cost: d.tokenCost,
      is_public: d.isPublic,
      sort_order: d.sortOrder,
      params_schema: d.params,
      definition: d,
    })),
    { onConflict: "slug" },
  );
  if (error) throw new Error(`登録に失敗: ${error.message}`);

  const { data: existing } = await supabase.from("gimmicks").select("slug, name, is_public");
  const removed = (existing ?? []).filter((g) => g.is_public && !defs.some((d) => d.slug === g.slug));
  if (removed.length > 0) {
    await supabase.from("gimmicks").update({ is_public: false }).in("slug", removed.map((g) => g.slug));
    for (const g of removed) console.log(`非公開にしました: ${g.name}（${g.slug}）※ catalog にないため`);
  }
  console.log(`${defs.length} 件を登録・更新しました。`);
}

main().catch((e) => {
  console.error(`\n失敗しました: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
