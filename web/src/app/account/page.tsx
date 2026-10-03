import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { Button, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm, DisplayNameForm } from "./forms";

export const metadata: Metadata = { title: "アカウント設定 | VRPrintLab" };

const reasonLabels: Record<string, string> = {
  signup_grant: "新規登録特典",
  purchase: "購入",
  consume: "ダウンロード",
  expire: "有効期限切れ",
  admin_adjust: "運営による調整",
};

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" });

export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();

  const [{ data: profile }, { data: balance }, { data: lots }, { data: history }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.rpc("get_token_balance"),
    supabase
      .from("token_lots")
      .select("remaining, expires_at")
      .eq("user_id", user.id)
      .gt("remaining", 0)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at")
      .limit(1),
    supabase
      .from("token_transactions")
      .select("id, delta, reason, note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const nextExpiry = lots?.[0];
  const hasPassword = user.identities?.some((i) => i.provider === "email") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">アカウント設定</h1>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            ログアウト
          </Button>
        </form>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">トークン</h2>
        <p className="text-4xl font-bold tabular-nums">
          {balance ?? 0}
          <span className="ml-1 text-base font-medium text-zinc-500">トークン</span>
        </p>
        {nextExpiry && (
          <p className="text-sm text-zinc-600">
            うち {nextExpiry.remaining} トークンの有効期限: {dateFormat.format(new Date(nextExpiry.expires_at))}
            （古いものから先に使われます）
          </p>
        )}
        {history && history.length > 0 && (
          <table className="mt-2 w-full text-sm">
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
                  <td className="py-1.5">{dateFormat.format(new Date(tx.created_at))}</td>
                  <td className="py-1.5">{reasonLabels[tx.reason] ?? tx.reason}</td>
                  <td className={`py-1.5 text-right tabular-nums ${tx.delta > 0 ? "text-emerald-700" : ""}`}>
                    {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">プロフィール</h2>
        <p className="text-sm">
          <span className="text-zinc-500">メールアドレス: </span>
          {user.email}
        </p>
        <DisplayNameForm defaultValue={profile?.display_name ?? ""} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">パスワード</h2>
        <p className="text-sm text-zinc-600">
          {hasPassword
            ? "ログインに使うパスワードを変更できます。"
            : "Google / Discord でログインしています。パスワードを設定すると、メールアドレスでもログインできるようになります。"}
        </p>
        <Link href="/account/password" className="self-start text-sm font-semibold underline">
          {hasPassword ? "パスワードを変更する" : "パスワードを設定する"}
        </Link>
      </Card>

      <Card className="flex flex-col gap-3 border-red-200">
        <h2 className="text-lg font-semibold text-red-700">退会</h2>
        <p className="text-sm text-zinc-600">
          保存した作品・アップロードした画像・残っているトークンはすべて削除され、元に戻せません。
          購入済みのトークンも払い戻しされません。
        </p>
        <DeleteAccountForm />
      </Card>
    </main>
  );
}
