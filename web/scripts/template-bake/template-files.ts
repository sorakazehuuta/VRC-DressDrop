// templates/<slug> フォルダの読み込み（templates:prepare / templates:check / templates:sync で共通）
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readUnityPackage, type UnityPackageEntry } from "../../src/lib/package/read-unitypackage";
import { templateManifestSchema, type TemplateManifest } from "../../src/lib/templates/schema";
import type { PreviewExtras } from "../../src/lib/templates/view";

export type { PreviewExtras };

z.config(z.locales.ja());

export const TEMPLATES_DIR = path.join(import.meta.dirname, "..", "..", "templates");

export function templateSlugs(only: string[]) {
  const slugs = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(TEMPLATES_DIR, d.name, "template.json")))
    .map((d) => d.name);
  for (const s of only) {
    if (!slugs.includes(s)) throw new Error(`templates/${s}/template.json が見つかりません`);
  }
  const result = only.length ? slugs.filter((s) => only.includes(s)) : slugs;
  if (result.length === 0) throw new Error("対象のテンプレートが見つかりません");
  return result;
}

export type TemplateFolder =
  | { ok: true; slug: string; dir: string; manifest: TemplateManifest; packageFile: string; packageData: Buffer; entries: UnityPackageEntry[] }
  | { ok: false; slug: string; dir: string; errors: string[] };

export function readTemplateFolder(slug: string): TemplateFolder {
  const dir = path.join(TEMPLATES_DIR, slug);
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(dir, "template.json"), "utf8"));
  } catch (e) {
    return { ok: false, slug, dir, errors: [`template.json を読めません: ${e instanceof Error ? e.message : e}`] };
  }
  const parsed = templateManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`template.json の ${issue.path.join(".") || "(全体)"}: ${issue.message}`);
    return { ok: false, slug, dir, errors };
  }
  const manifest = parsed.data;
  if (manifest.slug !== slug) errors.push(`フォルダ名 "${slug}" と slug "${manifest.slug}" を一致させてください`);
  const packageFile = path.join(dir, manifest.files.package);
  if (!existsSync(packageFile)) errors.push(`files.package のファイル "${manifest.files.package}" がありません`);
  if (errors.length) return { ok: false, slug, dir, errors };

  const packageData = readFileSync(packageFile);
  try {
    return { ok: true, slug, dir, manifest, packageFile, packageData, entries: readUnityPackage(packageData) };
  } catch (e) {
    return { ok: false, slug, dir, errors: [`${manifest.files.package}: ${e instanceof Error ? e.message : e}`] };
  }
}

// プレビュー用の glb がどの unitypackage から作られたかを記録・照合するためのハッシュ
export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

export function readGlbJson(file: string) {
  const buf = readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error("glb ファイルではありません");
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + jsonLength)) as {
    asset: { extras?: { vrprintlab?: PreviewExtras } };
    materials?: { name?: string }[];
    nodes?: { name?: string; mesh?: number }[];
    meshes?: { primitives: { material?: number; indices?: number; attributes: Record<string, number> }[] }[];
    accessors: { count: number }[];
  };
}
