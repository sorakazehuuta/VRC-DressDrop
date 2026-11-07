// 利用条件・データの扱いの確認: 下書きの引き継ぎ期限、LICENSE.txt、版の表示、同じ画像の貼り直し、
// 控えの削除と作り直し、作品の削除、管理画面のトークン調整、退会後に残る記録
const { chromium } = require("playwright");
const zlib = require("zlib");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const BASE = "http://localhost:3002";
const TEMPLATE = { slug: "cake" };
const DIR = process.env.SHOTS_DIR || require("path").join(__dirname, "shots");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `e2e-${Date.now()}@example.com`;
const password = "TestPass-12345";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);

// unitypackage（tar.gz）から、パスごとの中身を取り出す
function readUnityPackage(buffer) {
  const tar = zlib.gunzipSync(buffer);
  const entries = new Map();
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar.subarray(off, off + 100).toString("utf8").replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(tar.subarray(off + 124, off + 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    entries.set(name, tar.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  const files = new Map();
  for (const [name, data] of entries) {
    if (!name.endsWith("/pathname")) continue;
    const guid = name.slice(0, -"/pathname".length);
    const asset = entries.get(`${guid}/asset`);
    if (asset) files.set(data.toString("utf8").split("\n")[0].trim(), asset);
  }
  return files;
}

async function filesUnder(bucket, prefix) {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  return (data || []).length;
}

(async () => {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = created.user.id;
  await admin.from("profiles").update({ is_admin: true }).eq("id", uid);
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const balance = async () => (await page.locator("header").getByText(/トークン/).first().innerText()).trim();
  const panel = () => page.locator("div.mt-auto.rounded-lg");
  let accountDeleted = false;
  try {
    // ---- ログイン前の下書き: 期限切れはエディタを開くと消える ----
    await page.goto(`${BASE}/editor/${TEMPLATE.slug}`, { waitUntil: "networkidle" });
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("vrprintlab", 1);
          req.onupgradeneeded = () => req.result.createObjectStore("drafts");
          req.onsuccess = () => {
            const tx = req.result.transaction("drafts", "readwrite");
            const store = tx.objectStore("drafts");
            store.put({ name: "古い", params: {}, images: [], savedAt: Date.now() - 25 * 3600 * 1000 }, "old-test");
            store.put({ name: "新しい", params: {}, images: [], savedAt: Date.now() }, "new-test");
            tx.oncomplete = () => {
              req.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const keys = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("vrprintlab", 1);
          req.onsuccess = () => {
            const r = req.result.transaction("drafts").objectStore("drafts").getAllKeys();
            r.onsuccess = () => {
              req.result.close();
              resolve(r.result);
            };
          };
        }),
    );
    ok("期限切れの下書きだけが消える", !keys.includes("old-test") && keys.includes("new-test"), JSON.stringify(keys));

    // ---- ログインして1回目のダウンロード ----
    await page.goto(`${BASE}/login?next=/editor/${TEMPLATE.slug}`, { waitUntil: "networkidle" });
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.waitForURL(new RegExp(`/editor/${TEMPLATE.slug}`));
    await page.evaluate(() => localStorage.setItem("vrprintlab:overwrite-without-asking", "1"));
    await page.waitForSelector("canvas");

    const png = Buffer.from(
      await page.evaluate(async () => {
        const c = document.createElement("canvas");
        c.width = 400;
        c.height = 300;
        const g = c.getContext("2d");
        g.fillStyle = "#7c3aed";
        g.fillRect(0, 0, 400, 300);
        const blob = await new Promise((r) => c.toBlob(r, "image/png"));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }),
    );
    await page.locator('input[type="file"]').setInputFiles({ name: "a.png", mimeType: "image/png", buffer: png });
    await page.getByText("a.png").waitFor();
    await page.getByRole("button", { name: "保存してダウンロード" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 30000 });
    ok("初回の確認ダイアログに「まだ取得していません」", (await dialog.innerText()).includes("この作品はまだ取得していません"));
    const [d1] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), dialog.getByRole("button", { name: "ダウンロードする" }).click()]);
    const pkg = readUnityPackage(require("fs").readFileSync(await d1.path()));
    const license = [...pkg].find(([p]) => p.endsWith("/LICENSE.txt"));
    const readme = [...pkg].find(([p]) => p.endsWith("/README.txt"));
    const licenseText = license ? license[1].toString("utf8") : "";
    ok("LICENSE.txt を同梱", Boolean(license), license?.[0]);
    ok(
      "LICENSE.txt に利用条件・規約の版・URL",
      licenseText.includes("BOOTH") && licenseText.includes("再配布・再販売") && /規約の版\s*:\s*\d{4}-\d{2}-\d{2} 版/.test(licenseText) && licenseText.includes("/terms"),
    );
    ok("README から LICENSE.txt を案内", readme && readme[1].toString("utf8").includes("LICENSE.txt"));
    await panel().getByText("この版は取得済みです").waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelector("header").innerText.includes("2 トークン"), null, { timeout: 15000 });
    ok("1トークン消費", true);

    // ---- 同じ画像を貼り直す → 同じ版として無料 ----
    const { data: before } = await admin.from("work_images").select("id, content_hash").eq("work_id", (await admin.from("works").select("id").eq("user_id", uid).single()).data.id);
    ok("画像の中身のハッシュを記録", before.length === 1 && /^[0-9a-f]{64}$/.test(before[0].content_hash || ""));
    await page.locator('input[type="file"]').setInputFiles({ name: "a-again.png", mimeType: "image/png", buffer: png });
    await page.getByText("a-again.png").waitFor();
    const [d2] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: "保存してダウンロード" }).click()]);
    ok("同じ画像の貼り直しは確認なしでダウンロード", Boolean(d2.suggestedFilename()));
    await page.waitForTimeout(1500);
    const { data: workRow } = await admin.from("works").select("id").eq("user_id", uid).single();
    const { data: after } = await admin.from("work_images").select("id").eq("work_id", workRow.id);
    const { count: purchaseCount } = await admin.from("purchases").select("id", { count: "exact", head: true }).eq("user_id", uid);
    ok("貼り直しで画像 ID は変わる", after.length === 1 && after[0].id !== before[0].id);
    ok("貼り直しでは課金されない", (await balance()) === "2 トークン" && purchaseCount === 1, `${await balance()} / 購入 ${purchaseCount} 件`);
    const { data: replaced } = await admin.from("storage_deletions").select("reason, done_at").eq("user_id", uid).eq("reason", "image_replaced");
    ok("差し替えた古い画像は削除キュー経由で削除", replaced.length === 1 && replaced[0].done_at);

    // ---- 控えの削除 ----
    const { data: purchase } = await admin.from("purchases").select("id, package_path").eq("user_id", uid).single();
    await page.goto(`${BASE}/downloads/${purchase.id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "この版の控えを削除" }).click();
    const sd = page.getByRole("dialog");
    ok("控えの削除の確認に「再ダウンロードできなくなります」", (await sd.innerText()).includes("再ダウンロードできなくなります"));
    await page.screenshot({ path: `${DIR}/snapshot-delete-dialog.png` });
    await sd.getByRole("button", { name: "削除する" }).click();
    await page.getByText(/この版の控えは .* に削除したため/).waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${DIR}/snapshot-deleted.png` });
    const { data: p2 } = await admin.from("purchases").select("package_path, thumbnail_path, snapshot, snapshot_deleted_at, token_spent").eq("id", purchase.id).single();
    ok("控えを消しても購入の記録は残る", p2.token_spent === 1 && p2.snapshot_deleted_at && !p2.package_path && !p2.thumbnail_path && p2.snapshot && !p2.snapshot.images);
    ok(
      "控えのファイルが消える",
      (await filesUnder("packages", `${uid}/${purchase.id}`)) === 0 && !(await admin.storage.from("packages").download(purchase.package_path)).data,
    );
    await page.goto(`${BASE}/downloads`, { waitUntil: "networkidle" });
    ok("履歴に「控えは削除済み」", await page.getByText("控えは削除済み").isVisible());

    // ---- 控えを消した版を作品から作り直す（無料） ----
    await page.goto(`${BASE}/editor/${TEMPLATE.slug}?work=${workRow.id}`, { waitUntil: "networkidle" });
    await panel().getByText("この版は取得済みです").waitFor({ timeout: 30000 });
    const [d3] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: "ダウンロード", exact: true }).click()]);
    ok("控えを消した版を作品から作り直せる", Boolean(d3.suggestedFilename()));
    await page.waitForTimeout(1000);
    const { data: p3 } = await admin.from("purchases").select("package_path").eq("id", purchase.id).single();
    ok("作り直しは無料で、控えのパッケージが戻る", (await balance()) === "2 トークン" && Boolean(p3.package_path), p3.package_path);

    // ---- 見た目を変える → 新しい版の表示 ----
    await page.getByLabel("色 #16a34a").click();
    await page.getByRole("button", { name: "保存してダウンロード" }).click();
    await page.getByRole("dialog").waitFor({ timeout: 30000 });
    ok("見た目を変えると「新しい版として」", (await page.getByRole("dialog").innerText()).includes("新しい版としてトークンを使います"));
    await page.screenshot({ path: `${DIR}/changed-version-dialog.png` });
    await page.getByRole("dialog").getByRole("button", { name: "キャンセル" }).click();
    // 取得済みかどうかの確認は保存のあとに非同期で返ってくる
    const shown = await panel()
      .getByText("新しい版としてトークンを使います")
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    ok("保存後のパネルにも「新しい版として」", shown);

    // ---- 作品の削除 ----
    await page.goto(`${BASE}/works`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "削除", exact: true }).click();
    const wd = page.getByRole("dialog");
    ok("作品の削除の確認に控えが残る説明", (await wd.innerText()).includes("ダウンロードした版の控え"));
    await page.screenshot({ path: `${DIR}/work-delete-dialog.png` });
    await wd.getByRole("button", { name: "削除する" }).click();
    await page.waitForFunction(() => document.querySelectorAll("article").length === 0, null, { timeout: 15000 });
    const { data: wdel } = await admin.from("storage_deletions").select("done_at").eq("user_id", uid).eq("reason", "work_deleted");
    ok("作品の画像が削除キュー経由で消える", wdel.length === 1 && wdel[0].done_at && (await filesUnder("work-images", `${uid}/${workRow.id}`)) === 0);

    // ---- 管理画面: トークンの手動調整 ----
    await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(email)}`, { waitUntil: "networkidle" });
    await page.getByText(email).click();
    await page.waitForURL(/\/admin\/users\//);
    await page.getByLabel(/トークン数/).fill("2");
    await page.getByLabel(/理由/).fill("e2e の補填");
    await page.getByLabel(/関係する購入/).fill(purchase.id);
    await page.getByRole("button", { name: "調整する" }).click();
    await page.getByText("+2 トークンを調整しました。").waitFor({ timeout: 15000 });
    const { data: adj } = await admin.from("token_transactions").select("delta, note, created_by, ref_id").eq("user_id", uid).eq("reason", "admin_adjust");
    ok("調整の履歴に理由・管理者・関係する ID", adj.length === 1 && adj[0].delta === 2 && adj[0].note === "e2e の補填" && adj[0].created_by === uid && adj[0].ref_id === purchase.id);
    await page.getByLabel(/トークン数/).fill("-100");
    await page.getByLabel(/理由/).fill("減らしすぎ");
    await page.getByLabel(/関係する購入/).fill("");
    await page.getByRole("button", { name: "調整する" }).click();
    await page.getByText("減らすトークンが残高より多いです。").waitFor({ timeout: 15000 });
    ok("残高より多くは減らせない", true);
    await page.screenshot({ path: `${DIR}/admin-user.png`, fullPage: true });
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    ok("概要に未完了の削除の件数", await page.getByText(/未完了のファイル削除（\d+ 件）/).isVisible());

    // ---- 退会 ----
    await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
    ok("退会の説明に残る記録", await page.getByText("取引の記録として残るもの").isVisible());
    await page.screenshot({ path: `${DIR}/account-delete.png`, fullPage: true });
    await page.getByLabel(/確認のため/).fill("退会する");
    await page.getByRole("button", { name: "退会する" }).click();
    await page.waitForURL(/\?deleted=1/, { timeout: 30000 });
    accountDeleted = true;
    const { data: gone } = await admin.auth.admin.getUserById(uid);
    const { data: keptPurchases } = await admin.from("purchases").select("package_path, snapshot_deleted_at").eq("user_id", uid);
    const { data: keptTx } = await admin.from("token_transactions").select("reason, delta").eq("user_id", uid);
    const { data: lots } = await admin.from("token_lots").select("remaining").eq("user_id", uid);
    const { data: deleted } = await admin.from("deleted_accounts").select("deleted_at").eq("user_id", uid);
    const { data: accDel } = await admin.from("storage_deletions").select("done_at").eq("user_id", uid).eq("reason", "account_deleted");
    ok("ログインできるユーザーは消える", !gone?.user);
    ok("購入の記録は残り、控えは消える", keptPurchases.length === 1 && !keptPurchases[0].package_path && keptPurchases[0].snapshot_deleted_at);
    ok("トークンの履歴は残り、残高は 0 になる", keptTx.some((t) => t.reason === "account_deleted") && lots.every((l) => l.remaining === 0), keptTx.map((t) => `${t.reason}:${t.delta}`).join(" "));
    ok("退会日を記録", deleted.length === 1);
    ok(
      "Storage のファイルが消える",
      accDel.length === 2 && accDel.every((d) => d.done_at) && (await filesUnder("work-images", uid)) === 0 && (await filesUnder("packages", uid)) === 0,
    );
  } finally {
    console.log("ブラウザのエラー:", errors.length ? "\n  " + errors.join("\n  ") : "なし");
    await browser.close();
    const { error: de } = await cleanupUser(admin, uid);
    console.log("テストユーザーの後片付け:", de ? "失敗 " + de.message : "OK", accountDeleted ? "（退会済み）" : "");
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
