// アクリルスタンドの形（絵の形に切り抜く／四角のまま）と板の厚み。エディタ（日英・PC とスマホ幅）で切り替えて撮り、
// 保存してダウンロードしたパッケージの側面のメッシュとテクスチャを確かめる。ダウンロード内容の詳細に形が出ることも確かめる。
// アクリルスタンドは非公開なので、管理者のテスト用ユーザーで開く
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const B = process.env.BASE_URL || "http://localhost:3002";
const DIR = process.env.SHOTS_DIR || path.join(__dirname, "shots");
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// 背景が透明な、絵の形がわかる画像（丸い頭と体と星）
const ART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><circle cx="300" cy="260" r="190" fill="#f472b6"/><rect x="170" y="420" width="260" height="380" rx="60" fill="#3b82f6"/><polygon points="300,40 330,130 420,130 350,180 380,270 300,215 220,270 250,180 180,130 270,130" fill="#facc15"/><circle cx="240" cy="240" r="25" fill="#111"/><circle cx="360" cy="240" r="25" fill="#111"/></svg>`;

// unitypackage（tar.gz）から、パスで中身を取り出す
function readPackage(buf) {
  const tar = zlib.gunzipSync(buf);
  const files = new Map();
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar.toString("utf8", off, off + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(tar.toString("ascii", off + 124, off + 136).replace(/\0.*$/s, "").trim() || "0", 8);
    files.set(name.replace(/^\.\//, ""), tar.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  const byPath = new Map();
  for (const [name, data] of files) {
    if (!name.endsWith("/pathname")) continue;
    const guid = name.split("/")[0];
    byPath.set(data.toString("utf8").split("\n")[0].trim(), files.get(`${guid}/asset`));
  }
  return byPath;
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const email = `e2e-${Date.now()}-acrylic@example.com`, password = "TestPass-12345";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = data.user.id;
  await admin.from("profiles").update({ is_admin: true }).eq("id", uid);
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${B}/login?next=/editor/acrylic-stand`, { waitUntil: "networkidle" });
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.waitForURL(/\/editor\/acrylic-stand/);
    await page.evaluate(() => localStorage.setItem("vrprintlab:overwrite-without-asking", "1"));
    await page.waitForSelector("canvas");

    const art = await page.evaluate(async (svg) => {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 900;
      c.getContext("2d").drawImage(img, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, ART_SVG);
    await page.locator('input[type="file"]').setInputFiles({ name: "chara.png", mimeType: "image/png", buffer: Buffer.from(art) });
    await page.getByText("chara.png").waitFor();
    await page.waitForTimeout(1500);

    const controls = page.locator("[data-acrylic-controls]");
    ok("アクリルの形の欄が出る", await controls.isVisible());
    ok("最初は「絵の形に切り抜く」", await controls.getByLabel("絵の形に切り抜く").isChecked());
    const border = controls.getByLabel("アクリルの縁の幅（mm）");
    ok("縁の幅は既定の 4.4mm（110mm の 4%）", (await border.inputValue()) === "4.4", await border.inputValue());
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({ path: path.join(DIR, "acrylic-cutout-front.png") });

    // 斜めから見て、厚み（側面）を撮る
    const box = await canvas.boundingBox();
    const drag = async (dx, dy) => {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(800);
    };
    await drag(-60, 30);
    await canvas.screenshot({ path: path.join(DIR, "acrylic-cutout-angle.png") });

    await border.fill("9");
    await border.press("Enter");
    await page.waitForTimeout(1200);
    ok("縁の幅を変えられる", (await border.inputValue()) === "9", await border.inputValue());
    await canvas.screenshot({ path: path.join(DIR, "acrylic-cutout-wide-angle.png") });

    await controls.getByLabel("四角のまま").check();
    await page.waitForTimeout(800);
    ok("四角にすると横幅・高さ・角の丸めが出る", await controls.getByLabel("板の横幅（mm）").isVisible() && (await controls.getByLabel("角を丸める").isChecked()));
    ok("四角の最初の大きさは 110 × 152mm", (await controls.getByLabel("板の横幅（mm）").inputValue()) === "110" && (await controls.getByLabel("板の高さ（mm）").inputValue()) === "152");
    await controls.getByLabel("板の横幅（mm）").fill("90");
    await controls.getByLabel("板の横幅（mm）").press("Enter");
    await controls.getByLabel("板の高さ（mm）").fill("120");
    await controls.getByLabel("板の高さ（mm）").press("Enter");
    await page.waitForTimeout(1200);
    await canvas.screenshot({ path: path.join(DIR, "acrylic-rect-angle.png") });
    await controls.getByLabel("角を丸める").uncheck();
    await page.waitForTimeout(800);
    await canvas.screenshot({ path: path.join(DIR, "acrylic-rect-square-angle.png") });
    await controls.getByLabel("角を丸める").check();

    // 元に戻すで形も戻る
    await page.getByRole("button", { name: "元に戻す" }).click();
    await page.waitForTimeout(500);
    ok("元に戻すで角の丸めが戻る", !(await controls.getByLabel("角を丸める").isChecked()));
    await page.getByRole("button", { name: "やり直す" }).click();
    await page.waitForTimeout(500);
    await page.locator("main").screenshot({ path: path.join(DIR, "acrylic-editor-ja-pc.png") });

    // 保存してダウンロード
    await page.getByRole("button", { name: "保存してダウンロード" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), dialog.getByRole("button", { name: "ダウンロードする" }).click()]);
    const file = path.join(DIR, "acrylic-rect.unitypackage");
    await download.saveAs(file);
    const pkg = readPackage(fs.readFileSync(file));
    const edgePath = [...pkg.keys()].find((p) => p.endsWith("/Template/AcrylicStand_Edge.asset"));
    const edgeYaml = edgePath ? pkg.get(edgePath).toString("utf8") : "";
    const vertexCount = Number(/m_VertexCount: (\d+)/.exec(edgeYaml)?.[1] ?? 0);
    ok("パッケージの側面のメッシュが作り直されている（角丸の四角＋帯）", vertexCount > 32 && vertexCount < 400, `頂点 ${vertexCount}`);
    const ext = edgeYaml.match(/m_LocalAABB:\s*\n\s*m_Center: \{[^}]*\}\s*\n\s*m_Extent: \{x: ([\d.e-]+), y: ([\d.e-]+), z: ([\d.e-]+)\}/);
    ok("側面の幅は 90mm、厚みは 3mm", ext && Math.abs(Number(ext[1]) * 2 - 0.09) < 0.001 && Math.abs(Number(ext[3]) * 2 - 0.003) < 0.0002, ext ? `${(ext[1] * 2000).toFixed(1)}mm × 厚み ${(ext[3] * 2000).toFixed(2)}mm` : "なし");
    const texPath = [...pkg.keys()].find((p) => p.endsWith("/Tex_print.png"));
    ok("テクスチャがある", Boolean(texPath));
    if (texPath) fs.writeFileSync(path.join(DIR, "acrylic-rect-Tex_print.png"), pkg.get(texPath));

    // 保存した編集内容に形が入っている
    const { data: works } = await admin.from("works").select("id, params").eq("user_id", uid);
    const saved = works?.[0]?.params?.slots?.print?.acrylic;
    ok("保存した編集内容に形が入る", saved?.shape === "rect" && Math.abs(saved.width - 90 / 110) < 0.01 && saved.rounded === true, JSON.stringify(saved));

    // ダウンロード内容の詳細に形が出る
    await page.goto(`${B}/downloads`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "編集内容を見る" }).first().click();
    await page.waitForLoadState("networkidle");
    // 控えはダウンロードのあとに保存されるので、出るまで読み込み直す
    let detail = "";
    for (let i = 0; i < 10; i++) {
      detail = await page.locator("main").innerText();
      if (/アクリルの形/.test(detail)) break;
      await page.waitForTimeout(1500);
      await page.reload({ waitUntil: "networkidle" });
    }
    ok("ダウンロード内容の詳細に形が出る", /アクリルの形:\s*四角のまま（横 90mm \/ 縦 120mm・角を丸める）/.test(detail), detail.match(/アクリルの形.*$/m)?.[0] ?? detail.slice(0, 300).replace(/\s+/g, " "));
    await page.locator("main").screenshot({ path: path.join(DIR, "acrylic-download-detail-ja.png") });

    // 形を既定に戻すと、編集内容から項目が消える（以前の作品と同じ形）
    await page.goto(`${B}/editor/acrylic-stand?work=${works[0].id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    await page.locator("[data-acrylic-controls]").getByLabel("絵の形に切り抜く").check();
    const b2 = page.locator("[data-acrylic-controls]").getByLabel("アクリルの縁の幅（mm）");
    await b2.fill("4.4");
    await b2.press("Enter");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByText("保存しました").first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const { data: again } = await admin.from("works").select("params").eq("id", works[0].id).single();
    ok("既定の形に戻すと acrylic の項目を持たない", !("acrylic" in again.params.slots.print), JSON.stringify(again.params.slots.print.acrylic));

    // スマホ幅（日本語）
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
    const mp = await phone.newPage();
    watch(mp);
    await mp.goto(`${B}/editor/acrylic-stand?work=${works[0].id}`, { waitUntil: "networkidle" });
    await mp.waitForSelector("canvas");
    await mp.locator("[data-acrylic-controls]").getByLabel("四角のまま").check();
    await mp.waitForTimeout(800);
    await mp.locator("[data-acrylic-controls]").scrollIntoViewIfNeeded();
    await mp.locator("[data-acrylic-controls]").screenshot({ path: path.join(DIR, "acrylic-controls-ja-phone.png") });
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("スマホ幅で横にはみ出さない（日本語）", overflow <= 0, `${overflow}px`);
    await mp.evaluate(() => window.scrollTo(0, 0));
    await mp.screenshot({ path: path.join(DIR, "acrylic-editor-ja-phone.png") });

    // 英語版（PC とスマホ幅）
    for (const [label, context] of [
      ["pc", ctx],
      ["phone", phone],
    ]) {
      const ep = await context.newPage();
      watch(ep);
      await ep.goto(`${B}/en/editor/acrylic-stand?work=${works[0].id}`, { waitUntil: "networkidle" });
      await ep.waitForSelector("canvas");
      const c = ep.locator("[data-acrylic-controls]");
      ok(`英語の見出しと選択肢（${label}）`, (await c.getByText("Acrylic shape").isVisible()) && (await c.getByLabel("Cut to artwork").isChecked()));
      ok(`英語の縁の幅（${label}）`, (await c.getByLabel("Clear border width (mm)").inputValue()) === "4.4");
      await c.screenshot({ path: path.join(DIR, `acrylic-controls-en-${label}-cutout.png`) });
      await c.getByLabel("Rectangle").check();
      await ep.waitForTimeout(800);
      ok(`英語の四角の項目（${label}）`, (await c.getByLabel("Plate width (mm)").isVisible()) && (await c.getByLabel("Round the corners").isVisible()));
      await c.screenshot({ path: path.join(DIR, `acrylic-controls-en-${label}-rect.png`) });
      if (label === "phone") {
        const o = await ep.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok("スマホ幅で横にはみ出さない（英語）", o <= 0, `${o}px`);
      }
    }

    // 縁取りのないテンプレートには欄が出ない
    await page.goto(`${B}/editor/cake`, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    ok("縁取りのないテンプレートには欄が出ない", (await page.locator("[data-acrylic-controls]").count()) === 0);
    ok("ブラウザのエラーなし", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    console.log("テストユーザーの後片付け:", (await cleanupUser(admin, uid)).error ? "失敗" : "OK");
  }
})().catch((e) => {
  console.error("ERROR", e.message);
  process.exit(1);
});
