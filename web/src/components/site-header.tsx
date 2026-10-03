import Image from "next/image";
import Link from "next/link";
import logo from "../../images/common/logos/VRPrintLab_logo.png";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const balance = loggedIn ? (await supabase.rpc("get_token_balance")).data : null;

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4">
        <Link href="/" className="shrink-0">
          <Image src={logo} alt="VRPrintLab" priority className="h-9 w-auto sm:h-14" sizes="(min-width: 640px) 168px, 108px" />
        </Link>
        <nav className="flex items-center gap-2.5 whitespace-nowrap text-xs sm:gap-5 sm:text-sm">
          <Link href="/templates" className="font-medium hover:text-accent-dark">
            テンプレート
          </Link>
          {loggedIn ? (
            <>
              <Link href="/works" className="font-medium hover:text-accent-dark">
                マイ作品
              </Link>
              <Link href="/account" className="rounded-full bg-accent-soft px-3 py-1 font-semibold tabular-nums text-accent-dark">
                {balance ?? 0} トークン
              </Link>
              <Link href="/account" className="hidden hover:text-accent-dark sm:inline">
                アカウント
              </Link>
              <form action={signOut}>
                <button type="submit" className="cursor-pointer text-zinc-600 hover:underline">
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-accent-dark">
                ログイン
              </Link>
              <Link href="/signup" className="rounded-md bg-brand px-2.5 py-1.5 font-semibold sm:px-3 text-white hover:bg-brand-light">
                新規登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
