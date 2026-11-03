import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";

// Stripe の秘密キーは .env.local の STRIPE_SECRET_KEY（テストは sk_test_...）。未設定でもサイトの他の画面は動くよう、使う時点で作る
let client: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY が設定されていません");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

// 決済画面に出す支払い方法（Stripe のダッシュボードで有効にした支払い方法のうち、ここに挙げたものだけを出す）。
// コンビニ払いはダッシュボードで有効にしてから使う（日本のアカウントのみ）
export function paymentMethodTypes() {
  return (process.env.STRIPE_PAYMENT_METHODS ?? "card,konbini")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[];
}

const paymentIdOf = (session: Stripe.Checkout.Session) => session.metadata?.payment_id ?? null;
const intentIdOf = (session: Stripe.Checkout.Session) =>
  typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

export type SyncResult = "completed" | "awaiting_payment" | "blocked" | "expired" | "failed" | "pending" | "unknown";

// Checkout セッションの状態を DB に反映する（Webhook と、決済後に戻ってきた画面の両方から呼ぶ。何度呼んでも同じ結果になる）
export async function syncCheckoutSession(session: Stripe.Checkout.Session): Promise<SyncResult> {
  const paymentId = paymentIdOf(session);
  if (!paymentId) return "unknown";
  const admin = createAdminClient();
  const intentId = intentIdOf(session);

  if (session.status === "expired") {
    await admin.from("payments").update({ status: "expired", konbini_voucher_url: null }).eq("id", paymentId).in("status", ["created", "awaiting_payment"]);
    return "expired";
  }
  if (session.payment_status === "paid") return completePayment(paymentId, intentId);

  if (session.status === "complete" && intentId) {
    // コンビニ払いは決済画面を閉じた時点では未入金。払込票の URL と期限を記録して支払い待ちにする
    const intent = await stripe().paymentIntents.retrieve(intentId);
    if (intent.status === "succeeded") return completePayment(paymentId, intentId);
    if (intent.status === "canceled") {
      await admin.from("payments").update({ status: "failed", konbini_voucher_url: null }).eq("id", paymentId).in("status", ["created", "awaiting_payment"]);
      return "failed";
    }
    const konbini = intent.next_action?.konbini_display_details;
    await admin
      .from("payments")
      .update({
        status: "awaiting_payment",
        stripe_payment_intent_id: intentId,
        payment_method_type: "konbini",
        konbini_voucher_url: konbini?.hosted_voucher_url ?? null,
        konbini_expires_at: konbini?.expires_at ? new Date(konbini.expires_at * 1000).toISOString() : null,
      })
      .eq("id", paymentId)
      .in("status", ["created", "awaiting_payment"]);
    return "awaiting_payment";
  }
  return "pending";
}

// コンビニ払いが期限までに入金されなかった
export async function markSessionFailed(session: Stripe.Checkout.Session) {
  const paymentId = paymentIdOf(session);
  if (!paymentId) return;
  await createAdminClient()
    .from("payments")
    .update({ status: "failed", konbini_voucher_url: null })
    .eq("id", paymentId)
    .in("status", ["created", "awaiting_payment"]);
}

// 入金を確認できた支払いにトークンを付与する。カードの識別子はチャージバック対策に記録する
async function completePayment(paymentId: string, intentId: string | null): Promise<SyncResult> {
  let method: string | null = null;
  let fingerprint: string | null = null;
  if (intentId) {
    const intent = await stripe().paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    method = charge?.payment_method_details?.type ?? null;
    fingerprint = charge?.payment_method_details?.card?.fingerprint ?? null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_token_payment", {
    p_payment_id: paymentId,
    p_payment_intent_id: intentId,
    p_payment_method_type: method,
    p_card_fingerprint: fingerprint,
  });
  if (error) throw new Error(`トークンの付与に失敗: ${error.message}`);
  if (data === "blocked" && intentId) {
    // チャージバックが起きたカードでの支払いは受け付けず、全額を返金する
    await stripe().refunds.create({ payment_intent: intentId, reason: "fraudulent" }, { idempotencyKey: `blocked-${paymentId}` });
    return "blocked";
  }
  return data === "completed" ? "completed" : (data as SyncResult);
}

// 返金・チャージバックの通知から、その支払いで付与したトークンを取り消す
export async function revokeByPaymentIntent(intentId: string, kind: "refund" | "chargeback") {
  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("id").eq("stripe_payment_intent_id", intentId).maybeSingle();
  if (!payment) return null;
  const { data, error } = await admin.rpc("revoke_token_payment", { p_payment_id: payment.id, p_kind: kind });
  if (error) throw new Error(`トークンの取り消しに失敗: ${error.message}`);
  return data as number;
}
