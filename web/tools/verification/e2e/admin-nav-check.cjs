// 管理画面のタブで、開いているページのタブだけが選択中（下線・aria-current）になる
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const B = "http://localhost:3002";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
(async () => {
  const email = `e2e-${Date.now()}-nav@example.com`, password = "TestPass-12345";
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  await admin.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  try {
    await p.goto(`${B}/login?next=/admin`, { waitUntil: "networkidle" });
    await p.getByLabel("メールアドレス").fill(email); await p.getByLabel("パスワード").fill(password);
    await p.getByRole("button", { name: "ログイン", exact: true }).click(); await p.waitForURL((u) => u.pathname === "/admin"); await p.waitForLoadState("networkidle");
    const current = () => p.locator("nav", { hasText: "集計" }).locator('a[aria-current="page"]').allInnerTexts();
    for (const [path, label] of [["/admin", "概要"], ["/admin/users", "ユーザー"], [`/admin/users/${data.user.id}`, "ユーザー"], ["/admin/catalog", "テンプレート・ギミック"], ["/admin/stats", "集計"]]) {
      await p.goto(`${B}${path}`, { waitUntil: "networkidle" });
      const cur = await current();
      ok(`${path} で「${label}」だけが選択中`, cur.length === 1 && cur[0] === label, cur.join(","));
    }
    await p.getByRole("link", { name: "ユーザー", exact: true }).click(); await p.waitForURL("**/admin/users"); await p.waitForLoadState("networkidle");
    ok("タブを押すと選択中が移る", (await current()).join() === "ユーザー");
    await p.screenshot({ path: "tools/verification/e2e/shots/admin-nav-users.png", clip: { x: 0, y: 0, width: 1280, height: 200 } });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(`${B}/admin/catalog`, { waitUntil: "networkidle" });
    await p.screenshot({ path: "tools/verification/e2e/shots/admin-nav-mobile.png", clip: { x: 0, y: 0, width: 390, height: 260 } });
    ok("ブラウザのエラーなし", errors.length === 0, errors.join(" / "));
  } finally {
    await b.close(); console.log("テストユーザーの後片付け:", (await cleanupUser(admin, data.user.id)).error ? "失敗" : "OK");
  }
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
