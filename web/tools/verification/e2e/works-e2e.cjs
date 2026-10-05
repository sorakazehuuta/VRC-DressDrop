const { chromium } = require("playwright");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const BASE = "http://localhost:3002";
const SHOTS = process.env.SHOTS_DIR || require("path").join(__dirname, "shots");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `e2e-${Date.now()}@example.com`;
const password = "TestPass-12345";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);

async function makeImage(page, color, type) {
  return page.evaluate(
    async ([color, type]) => {
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 400;
      const g = c.getContext("2d");
      g.fillStyle = color;
      g.fillRect(0, 0, 600, 400);
      g.fillStyle = "#fff";
      g.font = "bold 120px sans-serif";
      g.fillText("TEST", 120, 250);
      const blob = await new Promise((r) => c.toBlob(r, type));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    [color, type],
  );
}

async function listFolder(uid, workId) {
  const { data } = await admin.storage.from("work-images").list(`${uid}/${workId}`);
  return (data || []).map((f) => f.name).sort();
}

(async () => {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = created.user.id;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", (d) => d.accept());
  let workId;
  try {
    // 1. 未ログインで編集 → ログインして保存 → 復元
    await page.goto(`${BASE}/editor/tshirt`, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    await page.locator('input[type="file"]').setInputFiles({
      name: "guest-print.png",
      mimeType: "image/png",
      buffer: Buffer.from(await makeImage(page, "#2563eb", "image/png")),
    });
    await page.getByText("guest-print.png").waitFor();
    await page.getByLabel("色 #facc15").click();
    await page.getByRole("button", { name: "ログインして保存" }).click();
    await page.waitForURL(/\/login\?next=/);
    ok("未ログインの保存でログイン画面へ移動", true, decodeURIComponent(new URL(page.url()).searchParams.get("next")));
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.waitForURL(/\/editor\/tshirt/);
    // 上書き保存の前の「前回の保存内容を残すか」の確認は versions-e2e で確かめるため、ここでは出さない
    await page.evaluate(() => localStorage.setItem("vrprintlab:overwrite-without-asking", "1"));
    await page.getByText("guest-print.png").waitFor({ timeout: 15000 });
    ok("ログイン後に画像が復元される", true);
    const yellowSelected = await page.getByLabel("色 #facc15").evaluate((el) => el.className.includes("ring-2"));
    ok("ログイン後に生地の色が復元される", yellowSelected);
    ok("未保存の表示", await page.getByText("未保存の変更があります").isVisible());

    // 2. 保存
    const t0 = Date.now();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("に保存しました") || document.querySelector("main [role=alert]"), null, { timeout: 30000 }).catch(async (e) => { console.log("タイムアウト時のボタン:", await page.locator("main button", { hasText: "保存" }).first().innerText()); await page.screenshot({ path: SHOTS + "/save-timeout.png" }); throw e; });
    const alertText = await page.locator("main [role=alert]").allInnerTexts();
    if (alertText.length) { console.log("保存エラー表示:", alertText.join(" / ")); await page.screenshot({ path: SHOTS + "/save-error.png" }); throw new Error("save failed"); }
    console.log("   初回保存の所要時間:", ((Date.now() - t0) / 1000).toFixed(1), "秒");
    workId = new URL(page.url()).searchParams.get("work");
    ok("保存後に URL に作品IDが入る", Boolean(workId), workId);
    const { data: work } = await admin.from("works").select("name, params, thumbnail_path").eq("id", workId).single();
    const { data: imgs1 } = await admin.from("work_images").select("id, slot, storage_path").eq("work_id", workId);
    ok("DB に作品が保存される", work && work.params.slots.base.color === "#facc15", `name=${work && work.name}`);
    ok("DB に画像が1件登録される", imgs1.length === 1 && imgs1[0].slot === "print");
    const files1 = await listFolder(uid, workId);
    { const { data: th } = await admin.storage.from("work-images").download(uid + "/" + workId + "/thumbnail.jpg"); fs.writeFileSync(SHOTS + "/thumb-first.jpg", Buffer.from(await th.arrayBuffer())); }
    ok("ストレージに画像とサムネイル", files1.length === 2 && files1.includes("thumbnail.jpg"), files1.join(", "));

    // 3. 再読み込みで復元
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("print.png").waitFor({ timeout: 15000 });
    ok("再読み込みで保存した画像が表示される", true);
    ok("再読み込み直後は保存済み表示", await page.getByText("保存済み").isVisible());
    await page.waitForTimeout(1500);
    await page.locator("canvas").first().screenshot({ path: `${SHOTS}/works-reload.png` });

    // 4. 色だけ変えて保存 → 画像は再アップロードされない
    await page.getByLabel("色 #dc2626").click();
    await page.keyboard.press("Control+s");
    await page.waitForFunction(() => document.body.innerText.includes("に保存しました") && !document.body.innerText.includes("未保存の変更"));
    { const { data: th } = await admin.storage.from("work-images").download(uid + "/" + workId + "/thumbnail.jpg"); fs.writeFileSync(SHOTS + "/thumb-second.jpg", Buffer.from(await th.arrayBuffer())); }
    const files2 = await listFolder(uid, workId);
    ok("色だけの変更では画像を再アップロードしない", JSON.stringify(files2) === JSON.stringify(files1));

    // 5. 画像を差し替えて保存 → 古い画像が消える
    await page.locator('input[type="file"]').setInputFiles({
      name: "second.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(await makeImage(page, "#16a34a", "image/jpeg")),
    });
    await page.getByText("second.jpg").waitFor();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("未保存の変更") && !document.body.innerText.includes("保存中"));
    await page.waitForTimeout(500);
    { const { data: th } = await admin.storage.from("work-images").download(uid + "/" + workId + "/thumbnail.jpg"); fs.writeFileSync(SHOTS + "/thumb-third.jpg", Buffer.from(await th.arrayBuffer())); }
    const files3 = await listFolder(uid, workId);
    const { data: imgs3 } = await admin.from("work_images").select("storage_path").eq("work_id", workId);
    ok(
      "差し替え後: 古い画像が消え、新しい jpg だけが残る",
      files3.length === 2 && files3.some((f) => f.endsWith(".jpg") && f !== "thumbnail.jpg") && !files3.some((f) => f.endsWith(".png")),
      files3.join(", "),
    );
    ok("差し替え後: DB の画像も1件", imgs3.length === 1 && imgs3[0].storage_path.endsWith(".jpg"));

    // 6. マイ作品
    await page.goto(`${BASE}/works`, { waitUntil: "networkidle" });
    ok("マイ作品に1件表示", (await page.locator("article").count()) === 1);
    await page.screenshot({ path: `${SHOTS}/works-list.png` });
    await page.getByRole("button", { name: "複製" }).click();
    await page.waitForFunction(() => document.querySelectorAll("article").length === 2, null, { timeout: 15000 });
    const { data: all } = await admin.from("works").select("id, name").eq("user_id", uid);
    const copy = all.find((w) => w.id !== workId);
    const copyFiles = await listFolder(uid, copy.id);
    ok("複製で作品と画像がコピーされる", copyFiles.length === 2, `${copy.name} / ${copyFiles.join(", ")}`);
    const copyCard = page.locator("article", { hasText: "（コピー）" });
    await copyCard.getByRole("button", { name: "名前を変更" }).click();
    const editingCard = page.locator("article").filter({ has: page.getByLabel("作品名") });
    await editingCard.getByLabel("作品名").fill("名前変更テスト");
    await editingCard.getByRole("button", { name: "保存" }).click();
    await page.getByText("名前変更テスト").waitFor();
    ok("名前を変更できる", true);
    await page.locator("article", { hasText: "名前変更テスト" }).getByRole("button", { name: "削除" }).click();
    await page.waitForFunction(() => document.querySelectorAll("article").length === 1, null, { timeout: 15000 });
    ok("削除で作品とストレージが消える", (await listFolder(uid, copy.id)).length === 0);

    // 7. スマホ幅のヘッダー（ログイン中）
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto(`${BASE}/works`, { waitUntil: "networkidle" });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    ok("360px でヘッダーがはみ出さない", width <= 360, `scrollWidth=${width}`);
    await page.screenshot({ path: `${SHOTS}/works-sp.png` });
  } finally {
    console.log("ブラウザのエラー:", errors.length ? "\n  " + errors.join("\n  ") : "なし");
    await browser.close();
    const { data: folders } = await admin.storage.from("work-images").list(uid);
    for (const f of folders || []) {
      const { data: files } = await admin.storage.from("work-images").list(`${uid}/${f.name}`);
      if (files && files.length) await admin.storage.from("work-images").remove(files.map((x) => `${uid}/${f.name}/${x.name}`));
    }
    const { error: de } = await admin.auth.admin.deleteUser(uid);
    console.log("テストユーザーの削除:", de ? "失敗 " + de.message : "OK");
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
