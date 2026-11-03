import type Stripe from "stripe";
import { markSessionFailed, revokeByPaymentIntent, stripe, syncCheckoutSession } from "@/lib/payments/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe からの通知（Webhook）。署名を検証してから処理する。
// 同じ通知が複数回届いても結果が変わらないよう、DB 側の関数がすべて二重処理を防いでいる。
// 処理に失敗したら 500 を返し、Stripe に再送してもらう
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Bad request", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      // 決済画面での支払い完了（カード）・申し込み完了（コンビニ）、コンビニの入金・期限切れ、決済画面の期限切れ
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.expired":
        await syncCheckoutSession(event.data.object);
        break;
      case "checkout.session.async_payment_failed":
        await markSessionFailed(event.data.object);
        break;
      case "charge.refunded": {
        const intent = event.data.object.payment_intent;
        if (intent) await revokeByPaymentIntent(typeof intent === "string" ? intent : intent.id, "refund");
        break;
      }
      case "charge.dispute.created": {
        const intent = event.data.object.payment_intent;
        if (intent) await revokeByPaymentIntent(typeof intent === "string" ? intent : intent.id, "chargeback");
        break;
      }
    }
  } catch (e) {
    console.error(`[stripe webhook] ${event.type} ${event.id}`, e);
    return new Response("Failed", { status: 500 });
  }
  return Response.json({ received: true });
}
