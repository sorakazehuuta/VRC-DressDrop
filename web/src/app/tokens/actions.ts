"use server";

import { redirect } from "next/navigation";
import { getLocale, localized } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { requireUser, siteOrigin } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/legal";
import { paymentMethodTypes, stripe, stripeConfigured } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { tokensMessages } from "./messages";

export type CheckoutState = { error?: string } | null;

// 選んだパックの決済画面（Stripe Checkout）を作って移動する。トークンの付与は入金の確認後（Webhook または戻ってきた画面）に行う
export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await requireUser("/tokens");
  const locale = await getLocale();
  const m = pick(tokensMessages, locale);
  if (!stripeConfigured()) return { error: m.errors.preparing };
  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("status").eq("id", user.id).single();
  if (profile?.status !== "active") return { error: m.errors.suspended };

  const packId = String(formData.get("packId") ?? "");
  const { data: pack } = await admin.from("token_packs").select("id, name, tokens, price_jpy").eq("id", packId).eq("is_active", true).maybeSingle();
  if (!pack) return { error: m.errors.packNotFound };

  const { data: payment, error } = await admin
    .from("payments")
    .insert({ user_id: user.id, pack_id: pack.id, amount_jpy: pack.price_jpy, tokens: pack.tokens, status: "created", terms_version: TERMS_VERSION })
    .select("id")
    .single();
  if (error || !payment) return { error: m.errors.prepareFailed };

  let url: string | null = null;
  try {
    const origin = await siteOrigin();
    const metadata = { payment_id: payment.id, user_id: user.id };
    const methods = paymentMethodTypes();
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        locale,
        client_reference_id: user.id,
        customer_email: user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "jpy",
              unit_amount: pack.price_jpy,
              product_data: {
                name: m.stripe.productName(pack.tokens),
                description: m.stripe.productDescription,
              },
            },
          },
        ],
        allowed_payment_method_types: methods,
        // カードは常に 3D セキュア（本人認証）を求める（不正利用の申し立て対策。要件定義書 6.11）。コンビニの支払い期限は3日
        payment_method_options: {
          card: { request_three_d_secure: "any" },
          ...(methods.includes("konbini") ? { konbini: { expires_after_days: 3 } } : {}),
        },
        metadata,
        payment_intent_data: { metadata },
        success_url: `${origin}${await localized("/tokens/return")}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${await localized("/tokens?canceled=1")}`,
      },
      { idempotencyKey: `checkout-${payment.id}` },
    );
    await admin.from("payments").update({ stripe_checkout_session_id: session.id }).eq("id", payment.id);
    url = session.url;
  } catch (e) {
    console.error("[checkout]", e);
    await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { error: m.errors.checkoutFailed };
  }
  if (!url) return { error: m.errors.checkoutFailedShort };
  redirect(url);
}
