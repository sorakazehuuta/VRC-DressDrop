const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const BASE = "http://localhost:3002";
const DIR = process.env.SHOTS_DIR || require("path").join(__dirname, "shots");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `e2e-${Date.now()}@example.com`;
const password = "TestPass-12345";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);

async function cleanup(uid) {
  for (const bucket of ["work-images", "packages"]) {
    const { data: entries } = await admin.storage.from(bucket).list(uid);
    for (const e of entries || []) {
      if (e.id) await admin.storage.from(bucket).remove([`${uid}/${e.name}`]);
      else {
        const { data: files } = await admin.storage.from(bucket).list(`${uid}/${e.name}`);
        if (files && files.length) await admin.storage.from(bucket).remove(files.map((f) => `${uid}/${e.name}/${f.name}`));
      }
    }
  }
  return admin.auth.admin.deleteUser(uid);
}

(async () => {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = created.user.id;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const num = (label) => page.getByLabel(new RegExp(`^${label}（`));
  const range = (label) => page.getByLabel(label, { exact: true });
  try {
    await page.goto(`${BASE}/login?next=/editor/tshirt`, { waitUntil: "networkidle" });
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.waitForURL(/\/editor\/tshirt/);
    await page.waitForSelector("canvas");

    // ---- 色の選択枠が切れていないか ----
    const swatch = page.getByLabel("色 #ffffff");
    const box = await swatch.boundingBox();
    const clip = await swatch.evaluate((el) => {
      let p = el.parentElement;
      while (p && getComputedStyle(p).overflowY === "visible") p = p.parentElement;
      return p ? p.getBoundingClientRect().left : 0;
    });
    ok("白の選択枠（外側4px）がスクロール領域の内側に収まる", box.x - 4 >= clip, `丸の左端 ${box.x.toFixed(0)}px / 切り取り境界 ${clip.toFixed(0)}px`);
    await page.locator("section", { hasText: "生地の色" }).screenshot({ path: `${DIR}/swatch-white.png` });

    // ---- 数値入力 ----
    const png = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 300;
      const g = c.getContext("2d");
      g.fillStyle = "#f97316";
      g.fillRect(0, 0, 400, 300);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await page.locator('input[type="file"]').setInputFiles({ name: "v.png", mimeType: "image/png", buffer: Buffer.from(png) });
    await page.getByText("v.png").waitFor();

    await num("サイズ").fill("50");
    await num("サイズ").press("Enter");
    ok("サイズに 50 を入力するとスライダーも 0.5", (await range("サイズ").inputValue()) === "0.5");
    await num("回転").fill("-45");
    await num("回転").press("Enter");
    ok("回転に -45 を入力", (await range("回転").inputValue()) === "-45");
    await num("明るさ").fill("999");
    await num("明るさ").press("Tab");
    ok("範囲外（999）は上限 200 に丸める", (await range("明るさ").inputValue()) === "200" && (await num("明るさ").inputValue()) === "200");
    await num("位置（上下）").fill("-30");
    await num("位置（上下）").press("Enter");
    ok("位置に負の値（-30%）を入力", (await range("位置（上下）").inputValue()) === "-0.3");
    await page.getByRole("button", { name: "元に戻す" }).click();
    ok("元に戻すで直前の入力だけ戻る", (await range("位置（上下）").inputValue()) === "0" && (await range("明るさ").inputValue()) === "200");
    await num("彩度").fill("40");
    await num("彩度").press("Control+z");
    ok("数値欄の中の Ctrl+Z はエディタ全体の元に戻すを動かさない", (await range("明るさ").inputValue()) === "200");
    await num("彩度").press("Escape");
    await page.locator("aside").screenshot({ path: `${DIR}/number-inputs.png` });

    // ---- 前回の内容を残す確認 ----
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByText("に保存しました").waitFor({ timeout: 30000 });
    ok("新規保存では確認ダイアログが出ない", (await page.getByRole("dialog").count()) === 0);
    const workId = new URL(page.url()).searchParams.get("work");

    await page.getByLabel("色 #1e3a8a").click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    ok("既存の作品を変更して保存すると確認ダイアログ", (await dialog.innerText()).includes("前回の保存内容を残しますか"));
    await dialog.getByRole("button", { name: "残して保存" }).click();
    await page.waitForFunction(() => document.body.innerText.includes("に保存しました") && !document.body.innerText.includes("未保存の変更"), null, { timeout: 30000 }).catch(async (e) => {
      console.log("表示中のエラー:", await page.locator("main [role=alert]").allInnerTexts());
      await page.screenshot({ path: DIR + "/keep-timeout.png" });
      throw e;
    });
    const { data: works1 } = await admin.from("works").select("id, name, params").eq("user_id", uid);
    const kept = works1.find((w) => w.id !== workId);
    const current = works1.find((w) => w.id === workId);
    ok("「残して保存」で前回の内容が別の作品として残る", works1.length === 2 && kept && kept.params.slots.base.color === "#ffffff", kept && kept.name);
    ok("元の作品は今の内容で保存される", current.params.slots.base.color === "#1e3a8a");
    const keptFiles = (await admin.storage.from("work-images").list(`${uid}/${kept.id}`)).data.map((f) => f.name);
    ok("残した作品にも画像とサムネイルがある", keptFiles.length === 2, keptFiles.join(", "));

    await page.getByLabel("色 #dc2626").click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    ok("キャンセルすると保存されない", (await page.getByText("未保存の変更があります").isVisible()) && (await admin.from("works").select("id").eq("user_id", uid)).data.length === 2);

    await page.getByRole("button", { name: "保存", exact: true }).click();
    await dialog.waitFor();
    await dialog.getByLabel("次回から確認せずに上書き保存する").check();
    ok("「次回から確認しない」にすると「残して保存」は押せない", await dialog.getByRole("button", { name: "残して保存" }).isDisabled());
    await dialog.getByRole("button", { name: "上書き保存" }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("未保存の変更") && !document.body.innerText.includes("保存中"), null, { timeout: 30000 });
    ok("上書き保存では作品は増えない", (await admin.from("works").select("id").eq("user_id", uid)).data.length === 2);
    await page.getByLabel("色 #16a34a").click();
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(500);
    ok("次回からは確認なしで上書き", (await page.getByRole("dialog").count()) === 0);
    await page.waitForFunction(() => !document.body.innerText.includes("未保存の変更"), null, { timeout: 30000 });

    // ---- ダウンロード履歴の控え ----
    await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
    await page.getByRole("dialog").waitFor({ timeout: 30000 });
    await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("dialog").getByRole("button", { name: "ダウンロードする" }).click()]);
    await page.waitForTimeout(1000);
    const { data: purchase } = await admin.from("purchases").select("id, snapshot, thumbnail_path").eq("user_id", uid).single();
    ok("購入時に控え（編集内容・サムネイル）が保存される", purchase.snapshot && purchase.thumbnail_path && Object.keys(purchase.snapshot.images).length === 1);

    await page.goto(`${BASE}/downloads`, { waitUntil: "networkidle" });
    const thumbOk = await page.locator("main li img").first().evaluate((i) => i.complete && i.naturalWidth > 0);
    ok("履歴の一覧にサムネイルが表示される", thumbOk);
    await page.getByRole("link", { name: "編集内容を見る" }).click();
    await page.waitForURL(/\/downloads\//);
    await page.waitForLoadState("networkidle");
    const detail = await page.locator("main").innerText();
    ok("詳細画面に生地の色", detail.includes("#16a34a"));
    ok("詳細画面にプリントの設定値", detail.includes("50%") && detail.includes("-45°") && detail.includes("200%"));
    await page.waitForTimeout(3000);
    const info = await page.locator("main img").evaluateAll((list) => list.map((i) => ({ src: i.getAttribute("src").slice(0, 160), ok: i.complete && i.naturalWidth > 0 })));
    console.log("   詳細画面の画像:", JSON.stringify(info, null, 1));
    for (const i of info) { const r = await fetch(i.src.startsWith("http") ? i.src : "x").catch(e => ({ status: String(e) })); console.log("   直接取得:", r.status); }
    const imgs = info.map((i) => i.ok);
    ok("詳細画面にサムネイルと使用した画像", imgs.length === 2 && imgs.every(Boolean));
    await page.screenshot({ path: `${DIR}/purchase-detail.png`, fullPage: true });
  } finally {
    console.log("ブラウザのエラー:", errors.length ? "\n  " + errors.join("\n  ") : "なし");
    await browser.close();
    const { error: de } = await cleanup(uid);
    console.log("テストユーザーの削除:", de ? "失敗 " + de.message : "OK");
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
