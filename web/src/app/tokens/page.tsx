import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { formatDate, formatDateTime } from "@/i18n/format";
import Link from "@/i18n/link";
import { getLocale, getMessages } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { requireUser } from "@/lib/auth";
import { stripeConfigured, type SyncResult } from "@/lib/payments/stripe";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { BuyButton } from "./buy-button";
import { tokensMessages } from "./messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(tokensMessages)).title} | VRPrintLab` };
}

const checkoutKinds: Record<SyncResult, "ok" | "info" | "error"> = {
  completed: "ok",
  awaiting_payment: "info",
  pending: "info",
  blocked: "error",
  account_deleted: "error",
  expired: "error",
  failed: "error",
  unknown: "error",
};

export default async function TokensPage({ searchParams }: { searchParams: Promise<{ result?: string; canceled?: string }> }) {
  const user = await requireUser("/tokens");
  // 決済画面から戻ったときは /tokens/return で状態を反映してから、結果だけを受け取る
  const { result: rawResult, canceled } = await searchParams;
  const result = rawResult && rawResult in checkoutKinds ? (rawResult as SyncResult) : null;
  const locale = await getLocale();
  const m = pick(tokensMessages, locale);
  const yen = m.yen;

  // 期限が切れたトークンを履歴に「有効期限切れ」として記録してから表示する
  await createAdminClient().rpc("expire_token_lots", { p_user_id: user.id });

  const supabase = await createClient();
  const [{ data: balance }, { data: profile }, { data: lots }, { data: packs }, { data: waiting }, { data: history }] = await Promise.all([
    supabase.rpc("get_token_balance"),
    supabase.from("profiles").select("status, token_debt").eq("id", user.id).single(),
    supabase
      .from("token_lots")
      .select("remaining, expires_at")
      .eq("user_id", user.id)
      .gt("remaining", 0)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at")
      .limit(1),
    supabase.from("token_packs").select("id, name, tokens, price_jpy").eq("is_active", true).order("sort_order"),
    supabase
      .from("payments")
      .select("id, tokens, amount_jpy, konbini_voucher_url, konbini_expires_at")
      .eq("user_id", user.id)
      .eq("status", "awaiting_payment")
      .order("created_at", { ascending: false }),
    supabase
      .from("token_transactions")
      .select("id, delta, reason, note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const nextExpiry = lots?.[0];
  const suspended = profile?.status === "suspended";
  const canBuy = stripeConfigured() && !suspended;
  const basePrice = packs?.[0] ? packs[0].price_jpy / packs[0].tokens : null;
  const message = result ? { kind: checkoutKinds[result], text: m.checkout[result] } : canceled ? { kind: "info" as const, text: m.checkout.canceled } : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold text-brand">{m.title}</h1>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-lg px-4 py-3 text-sm ${
            message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : message.kind === "error" ? "bg-red-50 text-red-800" : "bg-accent-soft text-brand"
          }`}
        >
          {message.text}
        </p>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{m.balance.heading}</h2>
        <p className={`text-4xl font-bold tabular-nums ${(balance ?? 0) < 0 ? "text-red-700" : ""}`}>
          {balance ?? 0}
          <span className="ml-1 text-base font-medium text-zinc-500">{m.balance.unit}</span>
        </p>
        {nextExpiry && (
          <p className="text-sm text-zinc-600">
            {m.balance.nextExpiry(nextExpiry.remaining, formatDate(locale, nextExpiry.expires_at))}
          </p>
        )}
        {(profile?.token_debt ?? 0) > 0 && (
          <p className="text-sm text-red-700">
            {m.balance.debt}
          </p>
        )}
        {suspended && <p className="text-sm text-red-700">{m.balance.suspended}</p>}
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{m.buy.heading}</h2>
          <p className="text-sm text-zinc-600">{m.buy.methods}</p>
        </div>
        {!stripeConfigured() && <p className="text-sm text-zinc-600">{m.buy.preparing}</p>}
        <ul className="grid gap-3 sm:grid-cols-3">
          {(packs ?? []).map((pack) => {
            const perToken = pack.price_jpy / pack.tokens;
            const discount = basePrice ? Math.round((1 - perToken / basePrice) * 100) : 0;
            return (
              <li key={pack.id} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4">
                <p className="text-2xl font-bold tabular-nums text-brand">
                  {pack.tokens}
                  <span className="ml-1 text-sm font-medium text-zinc-500">{m.buy.unit}</span>
                </p>
                <p className="text-lg font-semibold tabular-nums">{yen(pack.price_jpy)}</p>
                <p className="text-xs text-zinc-500">
                  {m.buy.perToken(yen(Math.round(perToken)))}
                  {discount > 0 && <span className="ml-1 font-semibold text-accent-dark">{m.buy.discount(discount)}</span>}
                </p>
                <BuyButton packId={pack.id} disabled={!canBuy} />
              </li>
            );
          })}
        </ul>
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-500">
          {m.buy.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="text-xs text-zinc-600">
          {m.buy.agree1}
          <Link href="/terms" className="underline" target="_blank">
            {m.buy.terms}
          </Link>
          {m.buy.and}
          <Link href="/tokushoho" className="underline" target="_blank">
            {m.buy.tokushoho}
          </Link>
          {m.buy.agree2}
        </p>
      </Card>

      {!!waiting?.length && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{m.waiting.heading}</h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {waiting.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {m.waiting.item(p.tokens, yen(p.amount_jpy))}
                  {p.konbini_expires_at && <span className="ml-2 text-zinc-500">{m.waiting.deadline(formatDateTime(locale, p.konbini_expires_at))}</span>}
                </span>
                {p.konbini_voucher_url && (
                  <a href={p.konbini_voucher_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-dark underline">
                    {m.waiting.voucher}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{m.history.heading}</h2>
        {!history?.length ? (
          <p className="text-sm text-zinc-600">{m.history.empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-1 font-medium">{m.history.date}</th>
                <th className="py-1 font-medium">{m.history.detail}</th>
                <th className="py-1 text-right font-medium">{m.history.delta}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((tx) => (
                <tr key={tx.id} className="border-t border-zinc-100">
                  <td className="py-1.5 align-top whitespace-nowrap">{formatDate(locale, tx.created_at)}</td>
                  <td className="py-1.5 pl-3">
                    {m.history.reasons[tx.reason] ?? tx.reason}
                    {tx.note && tx.reason !== "signup_grant" && tx.reason !== "expire" && <span className="block text-xs text-zinc-500">{tx.note}</span>}
                  </td>
                  <td className={`py-1.5 text-right align-top tabular-nums ${tx.delta > 0 ? "text-emerald-700" : ""}`}>{tx.delta > 0 ? `+${tx.delta}` : tx.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link href="/downloads" className="self-start text-sm font-semibold text-accent-dark underline">
          {m.history.downloads}
        </Link>
      </Card>
    </main>
  );
}
