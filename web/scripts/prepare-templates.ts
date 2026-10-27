// templates/<slug> の unitypackage から、ブラウザのプレビュー用モデル（preview.glb）を作る。
// Unity をバッチモードで起動し、Prefab を置いた状態の見た目（位置・大きさ・マテリアル）をそのまま書き出す。
//   npm run templates:prepare -- cake   … 指定したテンプレートだけ
//   npm run templates:prepare           … 全テンプレート
// Unity の場所は自動で探す（見つからなければ環境変数 UNITY_PATH に Unity.exe のパスを指定する）
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMaterial, isScript, resolveTemplatePrefab, type UnityPackageEntry } from "../src/lib/package/read-unitypackage";
import { buildGlb, type BakeOutput } from "./template-bake/glb";
import { readTemplateFolder, sha256, templateSlugs, type PreviewExtras } from "./template-bake/template-files";

const ROOT = path.join(import.meta.dirname, "..");
// 変換に使う Unity プロジェクト（git 管理外。初回は作成に数分かかる）
const WORK_DIR = path.join(ROOT, ".template-bake");
const PROJECT_DIR = path.join(WORK_DIR, "project");
const BAKER_DIR = path.join(PROJECT_DIR, "Assets", "VRPrintLabBake");
const PREFERRED_VERSION = "2022.3.22f1";

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function findUnity() {
  if (process.env.UNITY_PATH) {
    if (!existsSync(process.env.UNITY_PATH)) throw new Error(`UNITY_PATH の Unity が見つかりません: ${process.env.UNITY_PATH}`);
    return process.env.UNITY_PATH;
  }
  const hubs =
    process.platform === "darwin"
      ? [{ dir: "/Applications/Unity/Hub/Editor", exe: "Unity.app/Contents/MacOS/Unity" }]
      : [
          { dir: "C:\\Program Files\\Unity\\Hub\\Editor", exe: "Editor\\Unity.exe" },
          { dir: path.join(process.env.LOCALAPPDATA ?? "", "Unity", "Hub", "Editor"), exe: "Editor\\Unity.exe" },
        ];
  const found: { version: string; exe: string }[] = [];
  for (const hub of hubs) {
    if (!existsSync(hub.dir)) continue;
    for (const version of readdirSync(hub.dir)) {
      const exe = path.join(hub.dir, version, hub.exe);
      if (existsSync(exe)) found.push({ version, exe });
    }
  }
  const pick = found.find((f) => f.version === PREFERRED_VERSION) ?? found.find((f) => f.version.startsWith("2022.3.")) ?? found[0];
  if (!pick) throw new Error("Unity が見つかりません。Unity Hub で 2022.3 系をインストールするか、環境変数 UNITY_PATH に Unity.exe のパスを指定してください");
  return pick.exe;
}

// 前回のテンプレートの素材を消して変換用スクリプトだけを残し、unitypackage の中身を展開する
// （Unity の -importPackage / AssetDatabase.ImportPackage はバッチモードでは -executeMethod の後に処理されるため使わない）
function resetProject(entries: UnityPackageEntry[]) {
  const assets = path.join(PROJECT_DIR, "Assets");
  mkdirSync(assets, { recursive: true });
  for (const name of readdirSync(assets)) {
    if (name === "VRPrintLabBake" || name === "VRPrintLabBake.meta") continue;
    rmSync(path.join(assets, name), { recursive: true, force: true });
  }
  mkdirSync(path.join(BAKER_DIR, "Editor"), { recursive: true });
  copyFileSync(path.join(import.meta.dirname, "template-bake", "VRPrintLabTemplateBaker.cs"), path.join(BAKER_DIR, "Editor", "VRPrintLabTemplateBaker.cs"));

  for (const entry of entries) {
    const parts = entry.path.split("/");
    if (parts[0] !== "Assets" || parts.length < 2 || parts.some((p) => p === ".." || p === "")) {
      throw new Error(`unitypackage に Assets の外を指すパスがあります: ${entry.path}`);
    }
    const target = path.join(PROJECT_DIR, ...parts);
    if (entry.asset) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, entry.asset);
    } else {
      mkdirSync(target, { recursive: true });
    }
    writeFileSync(`${target}.meta`, entry.meta);
  }
}

function prepare(slug: string, unity: string) {
  const folder = readTemplateFolder(slug);
  if (!folder.ok) throw new Error(folder.errors.join("\n   "));
  const { manifest, entries, packageData, dir } = folder;
  const scripts = entries.filter(isScript);
  if (scripts.length) throw new Error(`unitypackage にスクリプトが含まれています。テンプレートには入れられません（${scripts.map((s) => s.path).join(", ")}）`);
  const prefab = resolveTemplatePrefab(entries, manifest.files.prefab);
  const materialCount = entries.filter(isMaterial).length;
  console.log(`  Prefab: ${prefab}（マテリアル ${materialCount} 個）`);

  resetProject(entries);
  const outDir = path.join(WORK_DIR, "out", slug);
  rmSync(outDir, { recursive: true, force: true });
  const logFile = path.join(WORK_DIR, `unity-${slug}.log`);
  console.log("  Unity で読み込んでいます（数分かかることがあります）…");
  const result = spawnSync(
    unity,
    [
      "-batchmode",
      "-nographics",
      "-projectPath", PROJECT_DIR,
      "-executeMethod", "VRPrintLabTemplateBaker.Bake",
      "-vrplPrefab", prefab,
      "-vrplOut", outDir,
      "-logFile", logFile,
    ],
    { stdio: "ignore", timeout: 20 * 60 * 1000 },
  );
  const errorFile = path.join(outDir, "error.txt");
  if (existsSync(errorFile)) throw new Error(`Unity での変換に失敗しました: ${readFileSync(errorFile, "utf8")}（詳細: ${logFile}）`);
  if (result.error || result.status !== 0 || !existsSync(path.join(outDir, "bake.json"))) {
    throw new Error(
      `Unity が正常に終了しませんでした（終了コード: ${result.status ?? result.error?.message}）。同じ Unity でこのプロジェクトを開いていないか、Unity Hub でライセンスが有効か確認してください（詳細: ${logFile}）`,
    );
  }

  const bake = JSON.parse(readFileSync(path.join(outDir, "bake.json"), "utf8")) as BakeOutput;
  const textures = new Map<string, Buffer>();
  for (const m of bake.materials) {
    const entry = m.texturePath ? entries.find((e) => e.path === m.texturePath) : undefined;
    if (entry?.asset) textures.set(m.texturePath, entry.asset);
  }
  const extras: { vrprintlab: PreviewExtras } = {
    vrprintlab: { source: manifest.files.package, sourceSha256: sha256(packageData), prefab },
  };
  const printSlots = manifest.slots.filter((s) => s.type === "print");
  const { glb, triangles, printAspects, printMirrored, facing } = buildGlb(bake, readFileSync(path.join(outDir, "mesh.bin")), {
    textures,
    printMaterials: new Set(printSlots.map((s) => s.material)),
    viewMaterial: printSlots[0]?.material,
    extras,
  });
  writeFileSync(path.join(dir, manifest.files.preview), glb);

  console.log(`  ${manifest.files.preview} を作りました（メッシュ ${bake.meshes.length} 個 / 三角形 ${triangles} / ${(glb.length / 1024 / 1024).toFixed(1)} MB）`);
  console.log(`  マテリアル: ${[...new Set(bake.materials.map((m) => m.name))].join(" / ")}`);
  for (const slot of printSlots) {
    const aspect = printAspects.get(slot.material);
    if (aspect === undefined) {
      console.log(`  注意: プリントスロット "${slot.key}" のマテリアル "${slot.material}" を使っている面が表示されていません`);
    } else {
      const mark = Math.abs(aspect - slot.aspect) / aspect > 0.03 ? "  ← template.json の aspect をこの値にしてください" : "";
      console.log(`  プリント面 "${slot.key}" の 幅÷高さ: ${aspect.toFixed(2)}（template.json: ${slot.aspect}）${mark}`);
    }
    if ((printMirrored.get(slot.material) ?? 0) > 0.6) {
      console.log(`  注意: プリント面 "${slot.key}" は UV が裏返っていて、外から見ると画像が左右反転します（Unity でも同じ）。Blender で UV を左右反転して書き出し直してください`);
    }
  }
  if (printSlots.length) {
    console.log(facing ? `  最初の視点: プリント面 "${printSlots[0].key}" の正面（向き ${facing.join(", ")}）` : "  最初の視点: 正面（プリント面の中心が見つからないため）");
  }
  for (const w of bake.warnings) console.log(`  注意: ${w}`);
}

function main() {
  const slugs = templateSlugs(only);
  const unity = findUnity();
  console.log(`Unity: ${unity}`);
  let failed = false;
  for (const slug of slugs) {
    console.log(`\n[${slug}]`);
    try {
      prepare(slug, unity);
    } catch (e) {
      failed = true;
      console.log(`  エラー: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (failed) process.exit(1);
  console.log("\n完了しました。続けて npm run templates:check で確認してください。");
}

main();
