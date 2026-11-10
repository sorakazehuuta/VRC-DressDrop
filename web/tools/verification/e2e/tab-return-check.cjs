// 管理画面でトークン数を変えたとき、開いたままの一覧・エディタのタブに戻ると新しい値になる（エディタの編集中の内容は残る）。
// 「エディタで確認」からの移動でも新しい値になる。変えたトークン数は最後に元に戻す
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const B = "http://localhost:3002";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
(async () => {
  const { data: cake } = await admin.from("templates").select("id, token_cost").eq("slug", "cake").single();
  const email = `e2e-${Date.now()}-cost@example.com`, password = "TestPass-12345";
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  await admin.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const editorCost = async (pg) => ((await pg.locator("body").innerText()).match(/ダウンロードに必要なトークン[:：]?\s*\d+/)?.[0] ?? "?").replace(/\s+/g, " ");
  const cardCost = async (pg) => await pg.locator("li", { hasText: "ケーキ" }).first().locator("strong").innerText();
  try {
    await p.goto(`${B}/login?next=/templates`, { waitUntil: "networkidle" });
    await p.getByLabel("メールアドレス").fill(email); await p.getByLabel("パスワード").fill(password);
    await p.getByRole("button", { name: "ログイン", exact: true }).click(); await p.waitForURL((u) => u.pathname === "/templates"); await p.waitForLoadState("networkidle");
    const tabA = await ctx.newPage(); await tabA.goto(`${B}/templates`, { waitUntil: "networkidle" });
    const tabE = await ctx.newPage(); await tabE.goto(`${B}/editor/cake`, { waitUntil: "networkidle" });
    ok("変更前の表示", (await cardCost(tabA)) === String(cake.token_cost) && (await editorCost(tabE)).endsWith(` ${cake.token_cost}`));
    await tabE.getByLabel("色 #16a34a").first().click(); await tabE.waitForTimeout(500);
    await p.goto(`${B}/admin/catalog`, { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
    await p.locator(`input[name="tokenCost:${cake.id}"]`).fill(String(cake.token_cost + 4));
    await p.getByRole("button", { name: "テンプレートを保存" }).click(); await p.getByText(/件を保存しました/).waitFor();
    await p.locator("div", { has: p.locator(`input[name="tokenCost:${cake.id}"]`) }).last().getByRole("link", { name: "エディタで確認" }).click();
    await p.waitForURL("**/editor/cake"); await p.waitForLoadState("networkidle");
    ok("「エディタで確認」から新しい値", (await editorCost(p)).endsWith(` ${cake.token_cost + 4}`), await editorCost(p));
    const tabReturn = (pg) => pg.evaluate(() => {
      for (const state of ["hidden", "visible"]) { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state }); document.dispatchEvent(new Event("visibilitychange")); }
    });
    await tabA.bringToFront(); await tabReturn(tabA); await tabA.waitForTimeout(2500);
    await tabE.bringToFront(); await tabReturn(tabE); await tabE.waitForTimeout(2500);
    ok("タブに戻ってもエディタの未保存の変更が残る", await tabE.getByText("未保存の変更があります").isVisible());
    ok("開いたままのタブに戻ると新しい値", (await cardCost(tabA)) === String(cake.token_cost + 4) && (await editorCost(tabE)).endsWith(` ${cake.token_cost + 4}`), `一覧 ${await cardCost(tabA)} / ${await editorCost(tabE)}`);
  } finally {
    await admin.from("templates").update({ token_cost: cake.token_cost }).eq("id", cake.id);
    await admin.from("admin_actions").delete().eq("admin_id", data.user.id);
    await b.close(); console.log("テストユーザーの後片付け:", (await cleanupUser(admin, data.user.id)).error ? "失敗" : "OK");
  }
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
