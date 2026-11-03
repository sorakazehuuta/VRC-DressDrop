import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { stripeConfigured, type SyncResult } from "@/lib/payments/stripe";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { tokenReasonLabels } from "@/lib/tokens/labels";
import { BuyButton } from "./buy-button";

export const metadata: Metadata = { title: "トークン | VRPrintLab" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" });
const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });
const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

const checkoutMessages: Record<SyncResult, { kind: "ok" | "info" | "error"; text: string }> = {
  completed: { kind: "ok", text: "お支払いが完了し、トークンを追加しました。" },
  awaiting_payment: { kind: "info", text: "コンビニでのお支払いをお待ちしています。入金が確認できしだいトークンを追加します（下の「お支払い待ち」から払込票を確認できます）。" },
  pending: { kind: "info", text: "お支払いを確認しています。反映まで少し時間がかかることがあります。しばらくしてからページを再読み込みしてください。" },
  blocked: { kind: "error", text: "このカードはご利用いただけません。お支払いは全額返金しました。" },
  account_deleted: { kind: "error", text: "退会済みのアカウントのため、お支払いは全額返金しました。" },
  expired: { kind: "error", text: "決済画面の有効期限が切れました。もう一度お試しください。" },
  failed: { kind: "error", text: "お支払いを完了できませんでした。もう一度お試しください。" },
  unknown: { kind: "error", text: "お支払いの情報を確認できませんでした。" },
};

export default async function TokensPage({ searchParams }: { searchParams: Promise<{ result?: string; canceled?: string }> }) {
  const user = await requireUser("/tokens");
  // 決済画面から戻ったときは /tokens/return で状態を反映してから、結果だけを受け取る
  const { result: rawResult, canceled } = await searchParams;
  const result = rawResult && rawResult in checkoutMessages ? (rawResult as SyncResult) : null;

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
  const message = result ? checkoutMessages[result] : canceled ? { kind: "info" as const, text: "購入をキャンセルしました。" } : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold text-brand">トークン</h1>

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
        <h2 className="text-lg font-semibold">残高</h2>
        <p className={`text-4xl font-bold tabular-nums ${(balance ?? 0) < 0 ? "text-red-700" : ""}`}>
          {balance ?? 0}
          <span className="ml-1 text-base font-medium text-zinc-500">トークン</span>
        </p>
        {nextExpiry && (
          <p className="text-sm text-zinc-600">
            うち {nextExpiry.remaining} トークンの有効期限: {dateFormat.format(new Date(nextExpiry.expires_at))}（古いものから先に使われます）
          </p>
        )}
        {(profile?.token_debt ?? 0) > 0 && (
          <p className="text-sm text-red-700">
            お支払いが取り消された分のトークンが使用済みのため、残高がマイナスになっています。マイナスの間はダウンロードできません。
          </p>
        )}
        {suspended && <p className="text-sm text-red-700">このアカウントは停止されています。トークンの購入とダウンロードはできません。</p>}
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">トークンを購入</h2>
          <p className="text-sm text-zinc-600">クレジット・デビット・プリペイドカード（Apple Pay / Google Pay を含む）、コンビニ払いが使えます。</p>
        </div>
        {!stripeConfigured() && <p className="text-sm text-zinc-600">現在トークンの購入を準備中です。</p>}
        <ul className="grid gap-3 sm:grid-cols-3">
          {(packs ?? []).map((pack) => {
            const perToken = pack.price_jpy / pack.tokens;
            const discount = basePrice ? Math.round((1 - perToken / basePrice) * 100) : 0;
            return (
              <li key={pack.id} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4">
                <p className="text-2xl font-bold tabular-nums text-brand">
                  {pack.tokens}
                  <span className="ml-1 text-sm font-medium text-zinc-500">トークン</span>
                </p>
                <p className="text-lg font-semibold tabular-nums">{yen(pack.price_jpy)}</p>
                <p className="text-xs text-zinc-500">
                  1トークンあたり {Math.round(perToken)}円{discount > 0 && <span className="ml-1 font-semibold text-accent-dark">{discount}% おトク</span>}
                </p>
                <BuyButton packId={pack.id} disabled={!canBuy} />
              </li>
            );
          })}
        </ul>
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-500">
          <li>代金は表示の金額（税込）で、ほかに手数料はかかりません。カードは購入時に、コンビニ払いは払込票の期限（3日）までにお支払いください。</li>
          <li>トークンは、カードは決済の完了後すぐに、コンビニ払いは入金の確認後に追加されます。</li>
          <li>デジタルの商品のため、決済後の購入の取り消し（キャンセル）はできません。</li>
          <li>トークンの有効期限は、購入・付与から180日です。古いものから先に使われます。</li>
          <li>トークンは VRPrintLab の中だけで使えます。換金・譲渡はできません。</li>
          <li>購入したトークンは原則として払い戻しできません。運営側の不具合でダウンロードできなかった場合などは返金に応じます（未使用分のみ）。</li>
          <li>未成年の方は、保護者の同意を得てから購入してください。</li>
          <li>コンビニ払いは、お支払いから反映まで数分かかることがあります。支払い期限は3日です。</li>
        </ul>
        <p className="text-xs text-zinc-600">
          「購入する」を押すと、
          <Link href="/terms" className="underline" target="_blank">
            利用規約
          </Link>
          と
          <Link href="/tokushoho" className="underline" target="_blank">
            特定商取引法に基づく表記
          </Link>
          の内容に同意したものとみなします。
        </p>
      </Card>

      {!!waiting?.length && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">お支払い待ち（コンビニ払い）</h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {waiting.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {p.tokens} トークン（{yen(p.amount_jpy)}）
                  {p.konbini_expires_at && <span className="ml-2 text-zinc-500">期限: {dateTimeFormat.format(new Date(p.konbini_expires_at))}</span>}
                </span>
                {p.konbini_voucher_url && (
                  <a href={p.konbini_voucher_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-dark underline">
                    払込票を見る
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">履歴</h2>
        {!history?.length ? (
          <p className="text-sm text-zinc-600">まだ履歴はありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-1 font-medium">日付</th>
                <th className="py-1 font-medium">内容</th>
                <th className="py-1 text-right font-medium">増減</th>
              </tr>
            </thead>
            <tbody>
              {history.map((tx) => (
                <tr key={tx.id} className="border-t border-zinc-100">
                  <td className="py-1.5 align-top whitespace-nowrap">{dateFormat.format(new Date(tx.created_at))}</td>
                  <td className="py-1.5 pl-3">
                    {tokenReasonLabels[tx.reason] ?? tx.reason}
                    {tx.note && tx.reason !== "signup_grant" && tx.reason !== "expire" && <span className="block text-xs text-zinc-500">{tx.note}</span>}
                  </td>
                  <td className={`py-1.5 text-right align-top tabular-nums ${tx.delta > 0 ? "text-emerald-700" : ""}`}>{tx.delta > 0 ? `+${tx.delta}` : tx.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link href="/downloads" className="self-start text-sm font-semibold text-accent-dark underline">
          ダウンロード履歴を見る
        </Link>
      </Card>
    </main>
  );
}
