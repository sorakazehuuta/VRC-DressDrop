const { chromium } = require("playwright");
const fs = require("fs");
const zlib = require("zlib");
const { createClient } = require("@supabase/supabase-js");
const BASE = "http://localhost:3002";
const DIR = process.env.SHOTS_DIR || require("path").join(__dirname, "shots");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `e2e-${Date.now()}@example.com`;
const password = "TestPass-12345";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);

function readPackage(file) {
  const tar = zlib.gunzipSync(fs.readFileSync(file));
  const entries = new Map();
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar.toString("utf8", off, off + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(tar.toString("ascii", off + 124, off + 136), 8);
    entries.set(name, tar.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  const files = new Map();
  for (const [name, data] of entries) if (name.endsWith("/pathname")) files.set(data.toString("utf8"), entries.get(name.replace("/pathname", "/asset")));
  return files;
}

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", (d) => d.accept());
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const item = (name) => page.locator("aside div.rounded-lg").filter({ has: page.locator("span.text-sm.font-medium", { hasText: new RegExp("^" + esc(name) + "$") }) }).first();
  const check = (name) => item(name).getByRole("checkbox").first();
  try {
    await page.goto(`${BASE}/login?next=/editor/tshirt`, { waitUntil: "networkidle" });
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.waitForURL(/\/editor\/tshirt/);
    await page.waitForSelector("canvas");

    // ---- ギミックの選択（ギミック欄は最初から開いている） ----
    ok("ギミック欄が最初から開いている", (await page.getByRole("button", { name: /ギミック（動き・演出）/ }).getAttribute("aria-expanded")) === "true");
    ok("ギミックが16種表示される", (await page.locator("aside div.rounded-lg input[type=checkbox]").count()) === 16);
    ok("軌跡は動くギミックがないと選べない", await check("動いたあとに軌跡").isDisabled());
    await check("ずっと回転する").check();
    ok("回転を選ぶと段階回転は選べない", await check("触るたびに段階的に回転").isDisabled());
    ok("回転を選ぶと設定項目が出る", await item("ずっと回転する").getByLabel(/^回る速さ（/).isVisible());
    await check("触るとライト ON/OFF").check();
    ok("ライトを選ぶと注意書きが出る", (await item("触るとライト ON/OFF").innerText()).includes("Quest"));
    ok("触る系は1つだけ（ライトを選ぶとパーティクル切替は選べない）", await check("触るとパーティクル ON/OFF").isDisabled());
    await item("ずっと回転する").getByLabel(/^回る速さ（/).fill("90");
    await item("ずっと回転する").getByLabel(/^回る速さ（/).press("Enter");
    ok("ダウンロード表示が合計（1+1+1=3）", (await page.locator("aside").innerText()).includes("ダウンロードに必要なトークン: 3"));
    await page.getByRole("button", { name: "元に戻す" }).click();
    await page.getByRole("button", { name: "元に戻す" }).click();
    ok("元に戻すでギミックの選択も戻る", !(await check("触るとライト ON/OFF").isChecked()));
    await page.getByRole("button", { name: "やり直す" }).click();
    await page.getByRole("button", { name: "やり直す" }).click();
    ok("やり直すで戻る", (await check("触るとライト ON/OFF").isChecked()) && (await item("ずっと回転する").getByLabel(/^回る速さ（/).inputValue()) === "90");
    await page.locator("aside").screenshot({ path: `${DIR}/gimmick-panel.png` });

    // ---- 保存してダウンロード（内訳） ----
    await page.getByRole("button", { name: "保存してダウンロード" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 30000 });
    const text1 = await dialog.innerText();
    ok("内訳にモデルと各ギミック", text1.includes("Tシャツ（モデル）") && text1.includes("ずっと回転する") && text1.includes("触るとライト ON/OFF") && /使用するトークン\s*3/.test(text1));
    await dialog.screenshot({ path: `${DIR}/gimmick-confirm.png` });
    const [dl1] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), dialog.getByRole("button", { name: "ダウンロードする" }).click()]);
    const file1 = `${DIR}/gimmick1.unitypackage`;
    await dl1.saveAs(file1);
    const files = readPackage(file1);
    const configPath = [...files.keys()].find((p) => p.endsWith("/VRPrintLab.json"));
    const config = JSON.parse(files.get(configPath).toString("utf8"));
    ok("パッケージに組み立て設定（回転・ライト）", config.gimmicks.map((g) => g.slug).join(",") === "toggle-light,spin" || config.gimmicks.map((g) => g.slug).join(",") === "spin,toggle-light", config.gimmicks.map((g) => g.slug).join(","));
    ok("回転の速さ 90 が設定に入る", config.gimmicks.find((g) => g.slug === "spin").params.find((p) => p.key === "speed").value === "90");
    ok("スクリプト一式と Editor スクリプトが入る", [...files.keys()].filter((p) => p.startsWith("Assets/VRPrintLab/_Runtime/")).length >= 11);
    await page.waitForFunction(() => document.querySelector("header").innerText.includes("0 トークン"), null, { timeout: 15000 });
    ok("3トークン消費", true);

    // ---- ギミックを足す → 追加分だけ ----
    await admin.from("token_lots").insert({ user_id: uid, amount: 5, remaining: 5, source: "admin" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    if (!(await check("キラキラのパーティクル").isVisible())) await page.getByRole("button", { name: /ギミック（動き・演出）/ }).click();
    await check("キラキラのパーティクル").check();
    await page.getByRole("button", { name: "保存してダウンロード" }).click();
    const keep = page.getByRole("dialog").filter({ hasText: "前回の保存内容" });
    if (await keep.isVisible().catch(() => false)) await keep.getByRole("button", { name: "上書き保存" }).click();
    const confirm2 = page.getByRole("dialog").filter({ hasText: "トークンを使ってダウンロード" });
    await confirm2.waitFor({ timeout: 30000 });
    const text2 = await confirm2.innerText();
    ok("ギミックを足すと追加分（1）だけ", /使用するトークン\s*1/.test(text2) && (text2.match(/購入済み 0/g) || []).length === 3, text2.replace(/\s+/g, " ").slice(0, 160));
    await Promise.all([page.waitForEvent("download", { timeout: 60000 }), confirm2.getByRole("button", { name: "ダウンロードする" }).click()]);
    await page.waitForFunction(() => document.querySelector("header").innerText.includes("4 トークン"), null, { timeout: 15000 });
    ok("残高 5→4", true);

    // ---- 設定値だけ変える → 無料（確認なし） ----
    await item("ずっと回転する").getByLabel(/^回る速さ（/).fill("120");
    await item("ずっと回転する").getByLabel(/^回る速さ（/).press("Enter");
    const [dl3] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      (async () => {
        await page.getByRole("button", { name: "保存してダウンロード" }).click();
        const k = page.getByRole("dialog").filter({ hasText: "前回の保存内容" });
        await k.waitFor({ timeout: 10000 }).then(() => k.getByRole("button", { name: "上書き保存" }).click()).catch(() => {});
      })(),
    ]);
    await page.waitForTimeout(1500);
    ok("設定値の変更だけなら確認なし・無料", Boolean(dl3) && (await page.locator("header").innerText()).includes("4 トークン"));

    const { data: purchases } = await admin.from("purchases").select("token_spent, gimmick_slugs, base_hash").eq("user_id", uid).order("created_at");
    ok("購入記録（3 / 1 / 0）", purchases.map((p) => p.token_spent).join(",") === "3,1,0" && purchases.every((p) => p.base_hash), purchases.map((p) => `${p.token_spent}:${p.gimmick_slugs.join("+")}`).join(" / "));

    await page.goto(`${BASE}/downloads`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "編集内容を見る" }).first().click();
    await page.waitForURL(/\/downloads\//);
    const detail = await page.locator("main").innerText();
    ok("履歴の詳細にギミック（回る速さ 120）", detail.includes("ずっと回転する") && detail.includes("回る速さ: 120°/秒") && detail.includes("キラキラのパーティクル"));
    await page.screenshot({ path: `${DIR}/gimmick-detail.png`, fullPage: true });
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
