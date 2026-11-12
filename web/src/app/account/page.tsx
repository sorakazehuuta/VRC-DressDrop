import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Card, buttonClassName } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm, DisplayNameForm } from "./forms";

export const metadata: Metadata = { title: "アカウント設定 | VRPrintLab" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" });

export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();

  const [{ data: profile }, { data: balance }, { data: lots }] = await Promise.all([
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
  ]);

  const nextExpiry = lots?.[0];
  const hasPassword = user.identities?.some((i) => i.provider === "email") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">アカウント設定</h1>
        <LogoutButton className={buttonClassName("secondary")} />
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
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/tokens" className="text-sm font-semibold text-accent-dark underline">
            トークンの購入・履歴
          </Link>
          <Link href="/downloads" className="text-sm font-semibold text-accent-dark underline">
            ダウンロード履歴を見る
          </Link>
        </div>
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
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-600">
          <p>退会すると元に戻せません。ダウンロードした作品も、再ダウンロードできなくなります。</p>
          <div>
            <p className="font-semibold text-zinc-800">削除されるもの</p>
            <ul className="list-disc pl-5">
              <li>保存した作品と、アップロードした画像</li>
              <li>ダウンロードした内容の控え（パッケージ・元画像のコピー・プレビュー画像）</li>
              <li>残っているトークン（購入したトークンも払い戻しされません）</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-zinc-800">取引の記録として残るもの</p>
            <ul className="list-disc pl-5">
              <li>支払いの記録、トークンの履歴</li>
              <li>ダウンロードの記録（日時・使ったトークン数・作品名・編集内容。画像とパッケージは含みません）</li>
            </ul>
          </div>
          <p>
            コンビニ払いの支払い待ちがある間は退会できません。詳しくは
            <Link href="/terms" className="underline">
              利用規約
            </Link>
            の第10条をご覧ください。
          </p>
        </div>
        <DeleteAccountForm />
      </Card>
    </main>
  );
}
