const { chromium } = require("playwright");
const fs = require("fs");
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
  const balance = async () => (await page.locator("header").getByText(/トークン/).first().innerText()).trim();
  try {
    await page.goto(`${BASE}/login?next=/editor/tshirt`, { waitUntil: "networkidle" });
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.waitForURL(/\/editor\/tshirt/);
    await page.waitForSelector("canvas");
    ok("ログイン直後の残高", (await balance()) === "3 トークン", await balance());

    const png = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 300;
      const g = c.getContext("2d");
      g.fillStyle = "#7c3aed";
      g.fillRect(0, 0, 400, 300);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await page.locator('input[type="file"]').setInputFiles({ name: "dl.png", mimeType: "image/png", buffer: Buffer.from(png) });
    await page.getByText("dl.png").waitFor();

    // 1回目: 保存してダウンロード → 確認 → トークン消費
    await page.getByRole("button", { name: "保存してダウンロード" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 30000 });
    const dialogText = await dialog.innerText();
    ok("確認ダイアログに使用量と残高", /使用するトークン\s*1/.test(dialogText) && /ダウンロード後の残高\s*2/.test(dialogText));
    const t0 = Date.now();
    const [download1] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), dialog.getByRole("button", { name: "ダウンロードする" }).click()]);
    console.log("   生成〜ダウンロード開始:", ((Date.now() - t0) / 1000).toFixed(1), "秒");
    ok("ファイル名が日本語", download1.suggestedFilename() === "Tシャツの作品.unitypackage", download1.suggestedFilename());
    const file1 = `${DIR}/dl1.unitypackage`;
    await download1.saveAs(file1);
    const head = fs.readFileSync(file1).subarray(0, 2);
    ok("中身が gzip（unitypackage）", head[0] === 0x1f && head[1] === 0x8b, `${(fs.statSync(file1).size / 1024).toFixed(0)} KB`);
    await page.getByText("この内容は購入済みです").waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelector("header").innerText.includes("2 トークン"), null, { timeout: 15000 });
    ok("1トークン消費され、ヘッダーの残高が2になる", true);

    // 2回目: 同じ内容 → 確認なしで無料
    const [download2] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: "ダウンロード", exact: true }).click()]);
    ok("購入済みの内容は確認なしでダウンロード", download2.suggestedFilename() === "Tシャツの作品.unitypackage");
    await page.waitForTimeout(1000);
    ok("再ダウンロードでは消費しない", (await balance()) === "2 トークン", await balance());

    // 3回目: 編集して内容を変える → 再びトークンが必要
    await page.getByLabel("色 #16a34a").click();
    ok("編集すると購入済み表示が消える", !(await page.getByText("この内容は購入済みです").isVisible()));
    await page.getByRole("button", { name: "保存してダウンロード" }).click();
    await page.getByRole("dialog").waitFor({ timeout: 30000 });
    await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("dialog").getByRole("button", { name: "ダウンロードする" }).click()]);
    await page.waitForFunction(() => document.querySelector("header").innerText.includes("1 トークン"), null, { timeout: 15000 });
    ok("内容を変えたら新しい版としてもう1トークン消費", true);

    // DB の確認
    const { data: purchases } = await admin.from("purchases").select("id, token_spent, package_path").eq("user_id", uid);
    const { data: txs } = await admin.from("token_transactions").select("delta, reason").eq("user_id", uid);
    ok("購入済みの版が2件", purchases.length === 2 && purchases.every((p) => p.token_spent === 1 && p.package_path));
    ok("消費の履歴が2件", txs.filter((t) => t.reason === "consume").length === 2);

    // ダウンロード履歴
    await page.goto(`${BASE}/downloads`, { waitUntil: "networkidle" });
    ok("ダウンロード履歴に2件", (await page.locator("main li").count()) === 2);
    const [download3] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.locator("main li").first().getByRole("button", { name: "ダウンロード" }).click()]);
    ok("履歴から日本語のファイル名で再ダウンロード", download3.suggestedFilename() === "Tシャツの作品.unitypackage");
    await page.screenshot({ path: `${DIR}/downloads.png` });

    // 作品を削除しても履歴から落とせる
    const { data: work } = await admin.from("works").select("id").eq("user_id", uid).single();
    await page.goto(`${BASE}/works`, { waitUntil: "networkidle" });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "削除" }).click();
    await page.waitForFunction(() => document.querySelectorAll("article").length === 0, null, { timeout: 15000 });
    await page.goto(`${BASE}/downloads`, { waitUntil: "networkidle" });
    ok("作品を削除しても履歴は残る", (await page.locator("main li").count()) === 2 && (await page.getByText("作品は削除済み").count()) === 2, work.id);
    const [download4] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.locator("main li").first().getByRole("button", { name: "ダウンロード" }).click()]);
    ok("削除後も再ダウンロードできる", Boolean(download4.suggestedFilename()));
  } finally {
    console.log("ブラウザのエラー:", errors.length ? "\n  " + errors.join("\n  ") : "なし");
    await browser.close();
    const { error: de } = await cleanup(uid);
    const { data: leftover } = await admin.storage.from("packages").list(uid);
    console.log("テストユーザーの削除:", de ? "失敗 " + de.message : "OK", "/ 保管ファイルの残り:", (leftover || []).length);
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
