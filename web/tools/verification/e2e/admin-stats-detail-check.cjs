// 管理画面の集計から月の詳細を開き、新規登録・支払い・ダウンロードの一覧（50 件ずつ）と内訳を確かめる。
// テスト用に 52 人を登録し、1 件の支払いと 1 人の退会を入れる（最後に消す）
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const B = "http://localhost:3002";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
(async () => {
  const marker = `e2e-${Date.now()}`, password = "TestPass-12345";
  const ids = [];
  const create = async (name) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `${marker}-${name}@example.com`, password, email_confirm: true });
    if (error) throw error;
    ids.push(data.user.id);
    return data.user;
  };
  const b = await chromium.launch();
  try {
    const me = await create("admin");
    await admin.from("profiles").update({ is_admin: true }).eq("id", me.id);
    for (let i = 0; i < 51; i++) await create(`u${String(i).padStart(2, "0")}`);
    const buyer = ids[1];
    const { data: pack } = await admin.from("token_packs").select("id, name, tokens, price_jpy").eq("is_active", true).order("sort_order").limit(1).single();
    const { error: payError } = await admin.from("payments").insert({ user_id: buyer, pack_id: pack.id, amount_jpy: pack.price_jpy, tokens: pack.tokens, status: "completed", completed_at: new Date().toISOString(), payment_method_type: "card" });
    if (payError) throw payError;
    // 退会した人（ユーザー本体を消し、退会の記録を残す）
    const leaver = await create("leaver");
    await admin.auth.admin.deleteUser(leaver.id);
    await admin.from("deleted_accounts").insert({ user_id: leaver.id });

    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${B}/login?next=/admin/stats`, { waitUntil: "networkidle" });
    await p.getByLabel("メールアドレス").fill(`${marker}-admin@example.com`); await p.getByLabel("パスワード").fill(password);
    await p.getByRole("button", { name: "ログイン", exact: true }).click(); await p.waitForURL((u) => u.pathname === "/admin/stats"); await p.waitForLoadState("networkidle");
    const monthRow = p.locator("tr", { has: p.getByRole("link", { name: month, exact: true }) }).locator("td");
    const signups = Number(await monthRow.nth(-2).innerText());
    ok("集計の表に退会の列", Number(await monthRow.last().innerText()) >= 1, await monthRow.last().innerText());
    ok("今月の新規登録にテスト用の 52 人が入る", signups >= 52, String(signups));

    await p.getByRole("link", { name: month, exact: true }).click(); await p.waitForURL(`**/admin/stats/${month}`); await p.waitForLoadState("networkidle");
    ok("月を押すと詳細が開く（最初は新規登録）", (await p.getByRole("heading", { level: 1 }).innerText()).endsWith("月の詳細") && (await p.getByRole("tab", { selected: true }).innerText()).startsWith("新規登録"));
    const rows = () => p.locator("tbody tr");
    ok("1 ページ目は 50 件", (await rows().count()) === 50);
    ok("新しい順で、メールアドレスが出る", (await rows().first().innerText()).includes(`${marker}-u50@example.com`));
    ok("登録中の人は「退会済み」にならず、エラーも出ない", (await p.getByText("（退会済み）").count()) === 0 && (await p.getByRole("alert").count()) === 0);
    ok("件数の表示", await p.getByText(`${signups} 件中 1〜50 件`).isVisible());
    await p.getByRole("link", { name: "次の 50 件" }).click(); await p.waitForURL(/page=2/); await p.waitForLoadState("networkidle");
    ok("2 ページ目に残りが出る", (await rows().count()) === signups - 50 && (await p.getByText(`${signups} 件中 51〜${signups} 件`).isVisible()));
    await p.screenshot({ path: "tools/verification/e2e/shots/admin-stats-signups.png", fullPage: true });

    await p.getByRole("tab", { name: /^退会/ }).click(); await p.waitForURL(/tab=withdrawals/); await p.waitForLoadState("networkidle");
    ok("退会の一覧に退会した人のユーザー ID", (await rows().filter({ hasText: leaver.id }).count()) === 1);
    ok("上部に退会の人数", Number((await p.locator("dl > div", { hasText: "退会" }).locator("dd").first().innerText()).replace(/\D/g, "")) >= 1);
    await p.screenshot({ path: "tools/verification/e2e/shots/admin-stats-withdrawals.png", fullPage: true });

    await p.getByRole("tab", { name: /^支払い/ }).click(); await p.waitForURL(/tab=payments/); await p.waitForLoadState("networkidle");
    const payRow = rows().filter({ hasText: `${marker}-u00@example.com` });
    ok("支払いの一覧にテストの支払い", (await payRow.count()) === 1 && (await payRow.innerText()).includes("入金済み") && (await payRow.innerText()).includes(pack.name), (await payRow.innerText()).replace(/\s+/g, " "));
    ok("パックごとの内訳", await p.getByText("パックごと").isVisible() && (await p.locator("li", { hasText: pack.name }).first().innerText()).includes("件"));
    await p.screenshot({ path: "tools/verification/e2e/shots/admin-stats-payments.png", fullPage: true });
    await payRow.getByRole("link").click(); await p.waitForURL(`**/admin/users/${buyer}`);
    ok("メールアドレスからユーザーの詳細へ", true);

    await p.goto(`${B}/admin/stats/${month}?tab=downloads`, { waitUntil: "networkidle" });
    const downloads = Number((await p.getByRole("tab", { name: /^ダウンロード/ }).innerText()).replace(/\D/g, ""));
    ok("ダウンロードの一覧", downloads === 0 ? await p.getByText("この月のダウンロードはありません").isVisible() : (await rows().count()) === Math.min(downloads, 50) && (await p.getByText("テンプレートごと").isVisible()), `${downloads} 件`);
    await p.screenshot({ path: "tools/verification/e2e/shots/admin-stats-downloads.png", fullPage: true });

    await p.getByRole("link", { name: "‹ 前の月" }).click(); await p.waitForURL(/\/admin\/stats\/\d{4}-\d{2}\?tab=downloads/);
    ok("前の月へ移ってもタブはそのまま", (await p.getByRole("tab", { selected: true }).innerText()).startsWith("ダウンロード"));
    for (const bad of ["2026-13", "abc", "2999-01"]) {
      const r = await p.goto(`${B}/admin/stats/${bad}`);
      ok(`不正な月 ${bad} は 404`, r.status() === 404);
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(`${B}/admin/stats/${month}?tab=payments`, { waitUntil: "networkidle" });
    ok("スマホ幅でページ全体は横にはみ出さない", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.screenshot({ path: "tools/verification/e2e/shots/admin-stats-mobile.png", fullPage: true });
    ok("ブラウザのエラーなし", errors.length === 0, errors.join(" / "));
  } finally {
    await b.close();
    let failed = 0;
    for (const id of ids) if ((await cleanupUser(admin, id)).error) failed++;
    await admin.from("admin_actions").delete().in("admin_id", ids.slice(0, 1));
    console.log(`テストユーザー ${ids.length} 人の後片付け:`, failed ? `${failed} 人失敗` : "OK");
  }
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
