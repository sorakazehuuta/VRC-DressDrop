// テンプレート一覧に表示するサムネイル（thumbnail.png）を、3Dモデルから自動で描画する。
//   npm run templates:thumbnails            … thumbnail がないテンプレートだけ作る
//   npm run templates:thumbnails -- tshirt  … 指定したテンプレートだけ
//   npm run templates:thumbnails -- --force … 自動生成したものを作り直す（template.json で指定した画像は上書きしない）
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium } from "playwright";
import { templateManifestSchema } from "../src/lib/templates/schema";

const ROOT = path.join(import.meta.dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const SAMPLE_IMAGE = path.join(ROOT, "images", "common", "icons", "VRPrintLab_icon.png");
export const AUTO_THUMBNAIL = "thumbnail.png";
const SIZE = { width: 800, height: 600 };

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

const mime: Record<string, string> = { ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".glb": "model/gltf-binary", ".json": "application/json" };

async function main() {
  const targets = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(TEMPLATES_DIR, d.name, "template.json")))
    .map((d) => d.name)
    .filter((s) => only.length === 0 || only.includes(s));

  let current: { glb: string; config: string } | null = null;
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    let file: string | null = null;
    let body: string | null = null;
    if (url === "/") file = path.join(import.meta.dirname, "thumbnail", "render.html");
    else if (url === "/config.json") body = current?.config ?? "{}";
    else if (url === "/model.glb") file = current?.glb ?? null;
    else if (url === "/sample.png") file = SAMPLE_IMAGE;
    else if (url.startsWith("/three/")) {
      const resolved = path.normalize(path.join(ROOT, "node_modules", url));
      if (resolved.startsWith(path.join(ROOT, "node_modules", "three"))) file = resolved;
    }
    if (body !== null) {
      res.writeHead(200, { "content-type": "application/json" }).end(body);
    } else if (file && existsSync(file)) {
      res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  let failed = false;
  try {
    for (const slug of targets) {
      const dir = path.join(TEMPLATES_DIR, slug);
      const parsed = templateManifestSchema.safeParse(JSON.parse(readFileSync(path.join(dir, "template.json"), "utf8")));
      if (!parsed.success) {
        console.log(`[スキップ] ${slug}: template.json に誤りがあります（npm run templates:check で確認してください）`);
        failed = true;
        continue;
      }
      const manifest = parsed.data;
      if (manifest.files.thumbnail && manifest.files.thumbnail !== AUTO_THUMBNAIL) {
        console.log(`[スキップ] ${slug}: template.json で指定された画像（${manifest.files.thumbnail}）を使います`);
        continue;
      }
      const out = path.join(dir, AUTO_THUMBNAIL);
      if (existsSync(out) && !force) {
        console.log(`[スキップ] ${slug}: ${AUTO_THUMBNAIL} があります（作り直すときは --force）`);
        continue;
      }

      current = {
        glb: path.join(dir, manifest.files.preview),
        config: JSON.stringify({ ...SIZE, slots: manifest.slots, sampleScale: 0.55 }),
      };
      const page = await browser.newPage({ viewport: SIZE });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/`);
      try {
        await page.waitForFunction("window.__rendered === true", null, { timeout: 30_000 });
        writeFileSync(out, await page.locator("canvas").screenshot({ type: "png" }));
        console.log(`[作成] ${slug}: ${path.relative(ROOT, out)}`);
      } catch {
        console.log(`[失敗] ${slug}: ${errors.join(" / ") || "描画がタイムアウトしました"}`);
        failed = true;
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
  console.log("\nSupabase に反映するには npm run templates:sync を実行してください。");
}

main().catch((e) => {
  console.error(`失敗しました: ${e instanceof Error ? e.message : e}`);
  if (String(e).includes("Executable doesn't exist")) console.error("初回は npx playwright install chromium を実行してください。");
  process.exit(1);
});
