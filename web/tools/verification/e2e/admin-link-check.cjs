// ヘッダーの「管理画面」リンクが管理者にだけ届くことの確認。
// 届いた HTML と、画面遷移で読み込むデータ（RSC）に、管理画面の URL・文字が含まれるかを調べる
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const BASE = "http://localhost:3002";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const password = "TestPass-12345";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);
const PAGES = ["/", "/templates", "/works", "/account", "/tokens", "/downloads", "/faq"];
const leaks = (text) => /href="\/admin|"\/admin["\/]|管理画面|\u7ba1\u7406\u753b\u9762/.test(text);

(async () => {
  const marker = `e2e-${Date.now()}`;
  const users = {};
  for (const role of ["user", "admin"]) {
    const { data, error } = await admin.auth.admin.createUser({ email: `${marker}-${role}@example.com`, password, email_confirm: true });
    if (error) throw error;
    users[role] = data.user;
  }
  await admin.from("profiles").update({ is_admin: true }).eq("id", users.admin.id);
  const browser = await chromium.launch();
  try {
    for (const role of ["anon", "user", "admin"]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      // 読み込まれたすべての応答（HTML・JavaScript・RSC）の中身を集める
      const bodies = [];
      page.on("response", async (r) => {
        try {
          if (r.url().startsWith(BASE)) bodies.push({ url: r.url(), text: await r.text() });
        } catch {}
      });
      if (role !== "anon") {
        await page.goto(`${BASE}/login?next=/account`, { waitUntil: "networkidle" });
        await page.getByLabel("メールアドレス").fill(users[role].email);
        await page.getByLabel("パスワード").fill(password);
        await page.getByRole("button", { name: "ログイン", exact: true }).click();
        await page.waitForURL((u) => u.pathname === "/account");
      }
      for (const path of PAGES) await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      // 画面内のリンクでの移動（RSC の取得）も含める
      await page.getByRole("link", { name: "テンプレート", exact: true }).first().click();
      await page.waitForLoadState("networkidle");
      // 直接 RSC を要求した場合
      const rsc = await page.evaluate(async () => (await fetch("/templates", { headers: { RSC: "1" } })).text());
      bodies.push({ url: "RSC /templates", text: rsc });

      const leaked = bodies.filter((b) => leaks(b.text)).map((b) => b.url);
      const visible = await page.getByRole("link", { name: "管理画面" }).count();
      if (role === "admin") {
        ok("管理者: ヘッダーに「管理画面」が表示される", visible === 1);
        await page.getByRole("link", { name: "管理画面" }).click();
        await page.waitForURL((u) => u.pathname === "/admin");
        ok("管理者: リンクから管理画面を開ける", true);
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${BASE}/templates`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "メニュー" }).click();
        ok("管理者: スマホのメニューにも「管理画面」", await page.getByRole("link", { name: "管理画面" }).isVisible());
        await page.screenshot({ path: `${__dirname}/shots/admin-link-mobile.png` });
      } else {
        ok(`${role === "anon" ? "未ログイン" : "一般の利用者"}: 画面に「管理画面」が出ない`, visible === 0);
        ok(
          `${role === "anon" ? "未ログイン" : "一般の利用者"}: 届いた HTML・JavaScript・RSC（${bodies.length} 件）に管理画面の URL・文字が含まれない`,
          leaked.length === 0,
          leaked.join(", "),
        );
        const res = await page.goto(`${BASE}/admin`);
        ok(`${role === "anon" ? "未ログイン" : "一般の利用者"}: /admin は 404`, res.status() === 404, String(res.status()));
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    for (const u of Object.values(users)) await cleanupUser(admin, u.id);
    console.log("テストユーザーの後片付け: OK");
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
