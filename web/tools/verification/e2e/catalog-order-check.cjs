// 管理画面のドラッグ・↑↓で並べ替えて保存すると、テンプレート一覧の「おすすめ順」とギミックの並びが変わる。
// テンプレート一覧の並べ替え（トークン数・名前・新しい順）と検索、URL への保存、スマホ幅を確かめる。並び順は最後に元に戻す
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const B = "http://localhost:3002";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
(async () => {
  const { data: templatesBefore } = await admin.from("templates").select("id, slug, name, name_reading, token_cost, is_public, sort_order, created_at").order("sort_order");
  const { data: gimmicksBefore } = await admin.from("gimmicks").select("id, slug, sort_order").order("sort_order");
  const email = `e2e-${Date.now()}-order@example.com`, password = "TestPass-12345";
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  await admin.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const cards = () => p.locator("li[data-template]").evaluateAll((els) => els.map((e) => e.dataset.template));
  try {
    await p.goto(`${B}/login?next=/admin/catalog`, { waitUntil: "networkidle" });
    await p.getByLabel("メールアドレス").fill(email); await p.getByLabel("パスワード").fill(password);
    await p.getByRole("button", { name: "ログイン", exact: true }).click(); await p.waitForURL((u) => u.pathname === "/admin/catalog"); await p.waitForLoadState("networkidle");

    // テンプレート: 3 番目の行をドラッグで先頭へ
    const tRows = p.locator("form").first().locator("[data-row]");
    const tOrder = () => tRows.evaluateAll((els) => els.map((e) => e.dataset.row));
    const before = await tOrder();
    ok("管理画面は今の並び順で表示", same(before, templatesBefore.map((t) => t.slug)));
    await tRows.nth(2).getByTitle("ドラッグして並べ替え").dragTo(tRows.nth(0));
    const dragged = await tOrder();
    ok("ドラッグで先頭へ動く", dragged[0] === before[2] && dragged.length === before.length, dragged.slice(0, 3).join(","));
    ok("保存前は注意書きを出す", await p.getByText("並び順を変えました").first().isVisible());
    // ↑↓ボタン: 最後の行を 1 つ上へ
    await tRows.last().getByRole("button", { name: /を上へ$/ }).click();
    const expected = await tOrder();
    ok("▲で 1 つ上へ動く", expected.at(-2) === dragged.at(-1));
    await p.getByRole("button", { name: "テンプレートを保存" }).click(); await p.getByText(/件を保存しました/).waitFor();
    const { data: templatesAfter } = await admin.from("templates").select("slug").order("sort_order");
    ok("テンプレートの並び順を DB に保存", same(templatesAfter.map((t) => t.slug), expected));
    await p.reload({ waitUntil: "networkidle" });
    ok("再読み込みしても保存した順", same(await tOrder(), expected) && !(await p.getByText("並び順を変えました").isVisible()));

    // ギミック: 先頭を 1 つ下へ
    const gRows = p.locator("form").nth(1).locator("[data-row]");
    const gBefore = await gRows.evaluateAll((els) => els.map((e) => e.dataset.row));
    await gRows.first().getByRole("button", { name: /を下へ$/ }).click();
    await p.getByRole("button", { name: "ギミックを保存" }).click(); await p.getByText(/件を保存しました/).last().waitFor();
    const { data: gimmicksAfter } = await admin.from("gimmicks").select("slug").order("sort_order");
    ok("ギミックの並び順を DB に保存", same(gimmicksAfter.map((g) => g.slug), [gBefore[1], gBefore[0], ...gBefore.slice(2)]));

    // テンプレート一覧: おすすめ順は管理画面の順
    const publicOrder = expected.filter((slug) => templatesBefore.find((t) => t.slug === slug).is_public);
    await p.goto(`${B}/templates`, { waitUntil: "networkidle" });
    ok("一覧のおすすめ順が管理画面の順", same(await cards(), publicOrder), (await cards()).slice(0, 3).join(","));

    const pub = templatesBefore.filter((t) => t.is_public);
    const rank = new Map(publicOrder.map((s, i) => [s, i]));
    const collator = new Intl.Collator("ja", { numeric: true });
    const by = (cmp) => [...pub].sort((a, c) => cmp(a, c) || rank.get(a.slug) - rank.get(c.slug)).map((t) => t.slug);
    const select = p.getByRole("combobox");
    for (const [value, label, want] of [
      ["cost-asc", "トークンが少ない順", by((a, c) => a.token_cost - c.token_cost)],
      ["cost-desc", "トークンが多い順", by((a, c) => c.token_cost - a.token_cost)],
      ["newest", "新しい順", by((a, c) => c.created_at.localeCompare(a.created_at))],
      ["name", "名前順", by((a, c) => collator.compare(a.name_reading || a.name, c.name_reading || c.name))],
    ]) {
      await select.selectOption(value);
      ok(`${label}`, same(await cards(), want), (await cards()).slice(0, 4).join(","));
    }
    ok("並び順を URL に残す", new URL(p.url()).searchParams.get("sort") === "name");
    await p.reload({ waitUntil: "networkidle" });
    ok("再読み込みしても名前順のまま", (await select.inputValue()) === "name" && same(await cards(), by((a, c) => collator.compare(a.name_reading || a.name, c.name_reading || c.name))));

    await p.getByLabel("テンプレートを名前で探す").fill("かんばん");
    const kanban = pub.filter((t) => t.name.includes("看板")).length;
    ok("読みで検索できる（かんばん → 看板）", (await cards()).length === kanban && kanban > 0, `${(await cards()).length} 件`);
    ok("件数を表示", await p.getByText(`に合うテンプレート ${kanban} 件`).isVisible());
    await p.getByLabel("テンプレートを名前で探す").fill("該当しないことば");
    ok("見つからないときの表示", await p.getByText("見つかりませんでした").isVisible());
    await p.getByLabel("テンプレートを名前で探す").fill("");
    await p.screenshot({ path: "tools/verification/e2e/shots/catalog-order-templates.png" });

    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(500);
    ok("スマホ幅で横にはみ出さない", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await p.screenshot({ path: "tools/verification/e2e/shots/catalog-order-mobile.png" });
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(`${B}/admin/catalog`, { waitUntil: "networkidle" });
    await p.screenshot({ path: "tools/verification/e2e/shots/catalog-order-admin.png", fullPage: true });
    ok("ブラウザのエラーなし", errors.length === 0, errors.join(" / "));
  } finally {
    for (const t of templatesBefore) await admin.from("templates").update({ sort_order: t.sort_order }).eq("id", t.id);
    for (const g of gimmicksBefore) await admin.from("gimmicks").update({ sort_order: g.sort_order }).eq("id", g.id);
    await admin.from("admin_actions").delete().eq("admin_id", data.user.id);
    await b.close(); console.log("並び順を元に戻し、テストユーザーの後片付け:", (await cleanupUser(admin, data.user.id)).error ? "失敗" : "OK");
  }
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
