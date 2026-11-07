// Phase 8 の確認: 非公開テンプレートが管理者にも出ない、規約ページ、通報（ログインなし・連続投稿の制限）、
// 管理画面での通報の対応（版・作品・アカウントの停止）、停止の利用者側の表示、テンプレートの設定、集計、規約の同意の記録
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
    user_metadata: { terms_version: "2026-11-03" },
  });
  if (oe) throw oe;
  const { data: a, error: ae } = await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  if (ae) throw ae;
  const ownerId = o.user.id;
  const adminId = a.user.id;
  await admin.from("profiles").update({ is_admin: true }).eq("id", adminId);

  // 通報の対象にする作品と購入した版（ファイルは使わないので DB の行だけ）
  const { data: cake } = await admin.from("templates").select("id, token_cost").eq("slug", "cake").single();
  const { data: work } = await admin.from("works").insert({ user_id: ownerId, template_id: cake.id, name: "通報テスト" }).select("id").single();
  const { data: purchase } = await admin
    .from("purchases")
    .insert({ work_id: work.id, user_id: ownerId, params_hash: marker, token_spent: 0, work_name: "通報テスト", template_name: "ケーキ", package_path: `${ownerId}/none.unitypackage` })
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
    ok("メールでの登録で同意した規約の版を記録", profile.terms_version === "2026-11-03" && profile.terms_agreed_at);

    // ---- 管理者でも非公開のテンプレートは出ない ----
    const adminPage = await newPage();
    await login(adminPage, adminEmail);
    await adminPage.goto(`${BASE}/templates`, { waitUntil: "networkidle" });
    ok("管理者のテンプレート一覧に Tシャツが出ない", (await adminPage.getByText("Tシャツ", { exact: true }).count()) === 0);

    // ---- 規約類のページ ----
    for (const [path, heading] of [["/privacy", "プライバシーポリシー"], ["/tokushoho", "特定商取引法に基づく表記"], ["/guide", "VRChat への導入ガイド"]]) {
      await adminPage.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      ok(`${path} が表示される`, await adminPage.getByRole("heading", { name: heading, level: 1 }).isVisible());
    }

    // ---- 通報（ログインなし） ----
    const anon = await newPage();
    const res = await anon.goto(`${BASE}/editor/tshirt`);
    ok("管理者以外は非公開の Tシャツのエディタを開けない", res.status() === 404, String(res.status()));
    await anon.goto(`${BASE}/report`, { waitUntil: "networkidle" });
    await anon.getByLabel("通報の種類").selectOption("copyright");
    await anon.getByLabel(/取得 ID/).fill(`取得 ID: ${purchase.id}`);
    await anon.getByLabel(/見かけた場所/).fill("テストワールド");
    await anon.locator('textarea[name="details"]').fill(`${marker} 無断転載の画像が使われています`);
    await anon.screenshot({ path: `${DIR}/report-form.png`, fullPage: true });
    await anon.getByRole("button", { name: "通報する" }).click();
    await anon.getByText("通報を受け付けました").waitFor({ timeout: 15000 });
    const { data: reports } = await admin.from("reports").select("id, purchase_id, work_id, category, reporter_id, ip_hash").ilike("reason", `${marker}%`);
    ok("通報が登録され、取得 ID から版と作品を特定", reports.length === 1 && reports[0].purchase_id === purchase.id && reports[0].work_id === work.id && !reports[0].reporter_id && reports[0].ip_hash);
    const reportId = reports[0].id;

    // 1時間に5件まで
    let limited = false;
    for (let i = 0; i < 5 && !limited; i++) {
      await anon.goto(`${BASE}/report`, { waitUntil: "networkidle" });
      await anon.getByLabel("通報の種類").selectOption("other");
      await anon.locator('textarea[name="details"]').fill(`${marker} 連続投稿 ${i}`);
      await anon.getByRole("button", { name: "通報する" }).click();
      await anon.getByText(/通報を受け付けました|短い時間に多くの通報/).waitFor({ timeout: 15000 });
      limited = await anon.getByText(/短い時間に多くの通報/).isVisible();
    }
    const { count: sent } = await admin.from("reports").select("id", { count: "exact", head: true }).ilike("reason", `${marker}%`);
    ok("同じ IP からの通報は1時間に5件まで", limited && sent === 5, `${sent} 件`);

    // ---- 管理画面で対応する ----
    await adminPage.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    ok("概要に未対応の通報の件数", await adminPage.getByText(/未対応の通報（\d+ 件）/).isVisible());
    await adminPage.goto(`${BASE}/admin/reports/${reportId}`, { waitUntil: "networkidle" });
    ok("通報の詳細に作成者", await adminPage.getByRole("link", { name: ownerEmail }).isVisible());
    await adminPage.getByRole("button", { name: "この版の再ダウンロードを停止" }).click();
    await adminPage.getByRole("button", { name: "版の停止を解除" }).waitFor();
    await adminPage.getByRole("button", { name: "作品を公開停止" }).click();
    await adminPage.getByRole("button", { name: "作品の公開停止を解除" }).waitFor();
    await adminPage.getByRole("button", { name: "アカウントを停止" }).click();
    await adminPage.getByRole("button", { name: "アカウントの停止を解除" }).waitFor();
    await adminPage.getByPlaceholder(/対応の内容/).fill("e2e: 停止した");
    await adminPage.getByRole("button", { name: "対応済みにする" }).click();
    await adminPage.getByText(/に更新/).waitFor();
    await adminPage.screenshot({ path: `${DIR}/admin-report.png`, fullPage: true });
    const [{ data: p2 }, { data: w2 }, { data: pr2 }, { data: r2 }, { data: actions }] = await Promise.all([
      admin.from("purchases").select("suspended_at").eq("id", purchase.id).single(),
      admin.from("works").select("status").eq("id", work.id).single(),
      admin.from("profiles").select("status").eq("id", ownerId).single(),
      admin.from("reports").select("status, admin_note, resolved_by").eq("id", reportId).single(),
      admin.from("admin_actions").select("action").eq("admin_id", adminId),
    ]);
    ok("版・作品・アカウントが停止される", p2.suspended_at && w2.status === "suspended" && pr2.status === "suspended");
    ok("通報が対応済みになり、対応した管理者を記録", r2.status === "resolved" && r2.admin_note === "e2e: 停止した" && r2.resolved_by === adminId);
    ok(
      "管理者の操作を記録",
      ["suspend_purchase", "suspend_work", "suspend_user", "resolve_report"].every((x) => actions.some((y) => y.action === x)),
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

    // ---- テンプレートの設定（変えて元に戻す） ----
    await adminPage.goto(`${BASE}/admin/catalog`, { waitUntil: "networkidle" });
    const cakeRow = adminPage.locator("form", { hasText: "cake" }).first();
    await cakeRow.locator('input[name="tokenCost"]').fill(String(cake.token_cost + 1));
    await cakeRow.getByRole("button", { name: "保存" }).click();
    await adminPage.waitForTimeout(1500);
    const { data: changed } = await admin.from("templates").select("token_cost").eq("id", cake.id).single();
    ok("テンプレートのトークン数を変えられる", changed.token_cost === cake.token_cost + 1);
    await adminPage.reload({ waitUntil: "networkidle" });
    await adminPage.locator("form", { hasText: "cake" }).first().locator('input[name="tokenCost"]').fill(String(cake.token_cost));
    await adminPage.locator("form", { hasText: "cake" }).first().getByRole("button", { name: "保存" }).click();
    await adminPage.waitForTimeout(1500);
    const { data: restored } = await admin.from("templates").select("token_cost").eq("id", cake.id).single();
    ok("元のトークン数に戻す", restored.token_cost === cake.token_cost);

    // ---- 集計 ----
    await adminPage.goto(`${BASE}/admin/stats`, { waitUntil: "networkidle" });
    const month = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date());
    ok("集計に今月の行", await adminPage.getByRole("cell", { name: month, exact: true }).isVisible(), month);
    await adminPage.screenshot({ path: `${DIR}/admin-stats.png`, fullPage: true });
  } finally {
    console.log("ブラウザのエラー:", errors.length ? "\n  " + errors.join("\n  ") : "なし");
    await browser.close();
    await admin.from("reports").delete().ilike("reason", `${marker}%`);
    await admin.from("admin_actions").delete().eq("admin_id", adminId);
    await admin.from("templates").update({ token_cost: cake.token_cost }).eq("id", cake.id);
    const r1 = await cleanupUser(admin, ownerId);
    const r2 = await cleanupUser(admin, adminId);
    console.log("テストユーザーの後片付け:", r1.error || r2.error ? "失敗" : "OK");
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
