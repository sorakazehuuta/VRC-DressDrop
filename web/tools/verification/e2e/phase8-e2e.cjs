// Phase 8 の確認: 非公開テンプレートが管理者にも出ない、規約ページ、通報の画面がなくなっていること、
// 管理画面での版・作品・アカウントの停止、停止の利用者側の表示、テンプレートのまとめての保存、ギミックがないときのエディタ、集計、規約の同意の記録
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const { cleanupUser } = require("./cleanup.cjs");
const BASE = "http://localhost:3002";
const DIR = process.env.SHOTS_DIR || require("path").join(__dirname, "shots");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const password = "TestPass-12345";
const marker = `e2e-${Date.now()}`;
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);

async function login(page, email) {
  await page.goto(`${BASE}/login?next=/account`, { waitUntil: "networkidle" });
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/account");
}

(async () => {
  const ownerEmail = `${marker}-owner@example.com`;
  const adminEmail = `${marker}-admin@example.com`;
  const { data: o, error: oe } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { terms_version: "2026-11-12" },
  });
  if (oe) throw oe;
  const { data: a, error: ae } = await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  if (ae) throw ae;
  const ownerId = o.user.id;
  const adminId = a.user.id;
  await admin.from("profiles").update({ is_admin: true }).eq("id", adminId);

  // 停止の対象にする作品と購入した版（ファイルは使わないので DB の行だけ）
  const { data: cake } = await admin.from("templates").select("id, token_cost").eq("slug", "cake").single();
  const { data: badge } = await admin.from("templates").select("id, token_cost").eq("slug", "badge").single();
  const { data: gimmicksBefore } = await admin.from("gimmicks").select("id, is_public").order("sort_order");
  const { data: work } = await admin.from("works").insert({ user_id: ownerId, template_id: cake.id, name: "停止テスト" }).select("id").single();
  const { data: purchase } = await admin
    .from("purchases")
    .insert({ work_id: work.id, user_id: ownerId, params_hash: marker, token_spent: 0, work_name: "停止テスト", template_name: "ケーキ", package_path: `${ownerId}/none.unitypackage` })
    .select("id")
    .single();

  const browser = await chromium.launch();
  const errors = [];
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    return p;
  };
  try {
    const { data: profile } = await admin.from("profiles").select("terms_version, terms_agreed_at").eq("id", ownerId).single();
    ok("メールでの登録で同意した規約の版を記録", profile.terms_version === "2026-11-12" && profile.terms_agreed_at);

    // ---- 管理者でも非公開のテンプレートは出ない ----
    const adminPage = await newPage();
    await login(adminPage, adminEmail);
    await adminPage.goto(`${BASE}/templates`, { waitUntil: "networkidle" });
    ok("管理者のテンプレート一覧に Tシャツが出ない", (await adminPage.getByText("Tシャツ", { exact: true }).count()) === 0);

    // ---- 規約類のページ ----
    for (const [path, heading] of [["/privacy", "プライバシーポリシー"], ["/tokushoho", "特定商取引法に基づく表記"], ["/guide", "VRChat への導入ガイド"], ["/news", "お知らせ"]]) {
      await adminPage.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      ok(`${path} が表示される`, await adminPage.getByRole("heading", { name: heading, level: 1 }).isVisible());
    }

    // ---- ログインなし ----
    const anon = await newPage();
    const res = await anon.goto(`${BASE}/editor/tshirt`);
    ok("管理者以外は非公開の Tシャツのエディタを開けない", res.status() === 404, String(res.status()));
    ok("通報のフォームがない", (await anon.goto(`${BASE}/report`)).status() === 404);
    ok("フッターに通報のリンクがない", (await anon.getByRole("link", { name: /通報/ }).count()) === 0);

    // ---- 管理画面で停止する ----
    ok("管理画面に通報の一覧がない", (await adminPage.goto(`${BASE}/admin/reports`)).status() === 404);
    await adminPage.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    ok("管理画面に通報の表示がない", (await adminPage.getByText("通報").count()) === 0);
    await adminPage.goto(`${BASE}/admin/users/${ownerId}`, { waitUntil: "networkidle" });
    await adminPage.getByRole("button", { name: "停止", exact: true }).click();
    await adminPage.getByRole("button", { name: "停止中（解除）" }).waitFor();
    await adminPage.getByRole("button", { name: "公開停止", exact: true }).click();
    await adminPage.getByText("公開停止中").waitFor();
    await adminPage.getByRole("button", { name: "アカウントを停止" }).click();
    await adminPage.getByRole("button", { name: "停止を解除" }).waitFor();
    await adminPage.screenshot({ path: `${DIR}/admin-user-suspended.png`, fullPage: true });
    const [{ data: p2 }, { data: w2 }, { data: pr2 }, { data: actions }] = await Promise.all([
      admin.from("purchases").select("suspended_at").eq("id", purchase.id).single(),
      admin.from("works").select("status").eq("id", work.id).single(),
      admin.from("profiles").select("status").eq("id", ownerId).single(),
      admin.from("admin_actions").select("action").eq("admin_id", adminId),
    ]);
    ok("版・作品・アカウントが停止される", p2.suspended_at && w2.status === "suspended" && pr2.status === "suspended");
    ok(
      "管理者の操作を記録",
      ["suspend_purchase", "suspend_work", "suspend_user"].every((x) => actions.some((y) => y.action === x)),
      actions.map((x) => x.action).join(","),
    );

    // ---- 利用者側の表示 ----
    const ownerPage = await newPage();
    await login(ownerPage, ownerEmail);
    await ownerPage.goto(`${BASE}/downloads`, { waitUntil: "networkidle" });
    ok("ダウンロード履歴に「運営により停止中」", await ownerPage.getByText("運営により停止中").isVisible());
    await ownerPage.goto(`${BASE}/tokens`, { waitUntil: "networkidle" });
    ok("停止中のアカウントは購入できない表示", await ownerPage.getByText("このアカウントは停止されています").isVisible());
    ok("購入画面に特商法表記への同意の案内", await ownerPage.getByRole("link", { name: "特定商取引法に基づく表記" }).first().isVisible());

    // ---- テンプレートの設定（変えて元に戻す。保存はまとめて1回） ----
    await adminPage.goto(`${BASE}/admin/catalog`, { waitUntil: "networkidle" });
    ok("保存ボタンはテンプレートとギミックで1つずつ", (await adminPage.getByRole("button", { name: /保存/ }).count()) === 2);
    await adminPage.getByRole("button", { name: "テンプレートを保存" }).click();
    await adminPage.getByText("変更はありません。").waitFor();
    const cakeCost = adminPage.locator(`input[name="tokenCost:${cake.id}"]`);
    const badgeCost = adminPage.locator(`input[name="tokenCost:${badge.id}"]`);
    await cakeCost.fill(String(cake.token_cost + 1));
    await badgeCost.fill(String(badge.token_cost + 1));
    await adminPage.getByRole("button", { name: "テンプレートを保存" }).click();
    await adminPage.getByText("2 件を保存しました。").waitFor();
    const { data: changed } = await admin.from("templates").select("slug, token_cost").in("id", [cake.id, badge.id]);
    ok("2つのテンプレートをまとめて変えられる", changed.every((t) => t.token_cost === (t.slug === "cake" ? cake : badge).token_cost + 1));
    ok("保存後の画面に新しい値", (await cakeCost.inputValue()) === String(cake.token_cost + 1));
    const { count: logged } = await admin.from("admin_actions").select("id", { count: "exact", head: true }).eq("admin_id", adminId).eq("action", "update_template");
    ok("変えた行だけ記録する", logged === 2, `${logged} 件`);
    await cakeCost.fill(String(cake.token_cost));
    await badgeCost.fill(String(badge.token_cost));
    await adminPage.getByRole("button", { name: "テンプレートを保存" }).click();
    await adminPage.waitForTimeout(1500);
    const { data: restored } = await admin.from("templates").select("slug, token_cost").in("id", [cake.id, badge.id]);
    ok("元のトークン数に戻す", restored.every((t) => t.token_cost === (t.slug === "cake" ? cake : badge).token_cost));

    // ---- ギミックの公開状態とエディタのパネル ----
    const panel = adminPage.getByRole("button", { name: /ギミック（動き・演出）/ });
    await admin.from("gimmicks").update({ is_public: true }).eq("id", gimmicksBefore[0].id); // すべて非公開の環境でも確認できるように
    await adminPage.goto(`${BASE}/editor/cake`, { waitUntil: "networkidle" });
    ok("公開中のギミックがあればパネルを表示", await panel.isVisible());
    await adminPage.goto(`${BASE}/admin/catalog`, { waitUntil: "networkidle" });
    for (const g of gimmicksBefore) await adminPage.locator(`input[name="isPublic:${g.id}"]`).uncheck();
    await adminPage.getByRole("button", { name: "ギミックを保存" }).click();
    await adminPage.getByText(/件を保存しました。/).waitFor();
    await adminPage.goto(`${BASE}/editor/cake`, { waitUntil: "networkidle" });
    ok("すべて非公開ならパネルを表示しない", (await panel.count()) === 0);
    await adminPage.screenshot({ path: `${DIR}/editor-no-gimmicks.png`, fullPage: true });
    await admin.from("gimmicks").update({ is_public: true }).eq("id", gimmicksBefore[0].id);
    await adminPage.goto(`${BASE}/editor/cake`, { waitUntil: "networkidle" });
    ok("1つでも公開ならパネルを表示", await panel.isVisible());

    // ---- 集計 ----
    await adminPage.goto(`${BASE}/admin/stats`, { waitUntil: "networkidle" });
    const month = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date());
    ok("集計に今月の行", await adminPage.getByRole("cell", { name: month, exact: true }).isVisible(), month);
    await adminPage.screenshot({ path: `${DIR}/admin-stats.png`, fullPage: true });
  } finally {
    console.log("ブラウザのエラー:", errors.length ? "\n  " + errors.join("\n  ") : "なし");
    await browser.close();
    await admin.from("admin_actions").delete().eq("admin_id", adminId);
    await admin.from("templates").update({ token_cost: cake.token_cost }).eq("id", cake.id);
    await admin.from("templates").update({ token_cost: badge.token_cost }).eq("id", badge.id);
    for (const g of gimmicksBefore) await admin.from("gimmicks").update({ is_public: g.is_public }).eq("id", g.id);
    const r1 = await cleanupUser(admin, ownerId);
    const r2 = await cleanupUser(admin, adminId);
    console.log("テストユーザーの後片付け:", r1.error || r2.error ? "失敗" : "OK");
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
