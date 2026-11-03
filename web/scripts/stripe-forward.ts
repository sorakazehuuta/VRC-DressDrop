// 開発用: Stripe（テストモード）のイベントを数秒おきに取得し、署名を付けてローカルの Webhook に転送する。
// Stripe CLI の `stripe listen --forward-to` の代わり（インストール不要）。本番では使わない（ダッシュボードに Webhook を登録する）
//   npm run stripe:forward                      … http://localhost:3000/api/stripe/webhook に転送
//   npm run stripe:forward -- http://localhost:3002/api/stripe/webhook
// .env.local の STRIPE_WEBHOOK_SECRET（開発では任意の文字列でよい）で署名する
import Stripe from "stripe";

const target = process.argv[2] ?? "http://localhost:3000/api/stripe/webhook";
const key = process.env.STRIPE_SECRET_KEY;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!key?.startsWith("sk_test_")) throw new Error("STRIPE_SECRET_KEY にテストモードのキー（sk_test_...）を設定してください");
if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET を設定してください（開発では任意の文字列でよい）");

const stripe = new Stripe(key);
const seen = new Set<string>();
let since = Math.floor(Date.now() / 1000) - 5;

async function poll() {
  const { data } = await stripe.events.list({ created: { gte: since }, limit: 100 });
  for (const event of data.reverse()) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    since = Math.max(since, event.created - 5);
    const payload = JSON.stringify(event);
    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: secret! }) },
      body: payload,
    }).catch((e: Error) => ({ status: `接続できません（${e.message}）` }));
    console.log(`${new Date().toLocaleTimeString("ja-JP")}  ${event.type.padEnd(42)} → ${res.status}`);
  }
}

console.log(`Stripe のイベントを ${target} に転送します（Ctrl+C で終了）`);
for (;;) {
  await poll().catch((e) => console.error("取得に失敗:", e instanceof Error ? e.message : e));
  await new Promise((r) => setTimeout(r, 3000));
}
