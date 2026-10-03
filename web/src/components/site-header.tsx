import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const balance = loggedIn ? (await supabase.rpc("get_token_balance")).data : null;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-bold">
          VRC-DressDrop
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {loggedIn ? (
            <>
              <Link href="/account" className="rounded-full bg-zinc-100 px-3 py-1 font-semibold tabular-nums dark:bg-zinc-800">
                {balance ?? 0} トークン
              </Link>
              <Link href="/account" className="hover:underline">
                アカウント
              </Link>
              <form action={signOut}>
                <button type="submit" className="cursor-pointer text-zinc-600 hover:underline dark:text-zinc-400">
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                ログイン
              </Link>
              <Link href="/signup" className="rounded-md bg-zinc-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-zinc-900">
                新規登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
