import { NextResponse, type NextRequest } from "next/server";
import { localized } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth";
import { stripe, stripeConfigured, syncCheckoutSession, type SyncResult } from "@/lib/payments/stripe";

export const dynamic = "force-dynamic";

// 決済画面から戻ってきたときの入口。Webhook を待たずに支払いの状態を反映してから（二重には付与されない）トークン画面へ移る。
// 画面の描画中に反映するとヘッダーの残高が古いまま表示されるため、表示とは分けている
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  let result: SyncResult = "unknown";
  const user = await getCurrentUser();
  if (user && stripeConfigured() && sessionId.startsWith("cs_")) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.user_id === user.id) result = await syncCheckoutSession(session);
    } catch (e) {
      console.error("[tokens/return]", e);
      result = "pending";
    }
  }
  // 英語版から戻ってきたとき（/en/tokens/return）は英語版のトークン画面へ
  return NextResponse.redirect(new URL(await localized(`/tokens?result=${result}`), request.url), 303);
}
