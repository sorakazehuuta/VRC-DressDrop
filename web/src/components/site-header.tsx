import Image from "next/image";
import Link from "@/i18n/link";
import logo from "../../images/common/logos/VRPrintLab_logo.png";
import { createClient } from "@/lib/supabase/server";
import { AdminNavLink } from "./admin-nav-link";
import { HeaderNav } from "./header-nav";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const balance = loggedIn ? (await supabase.rpc("get_token_balance")).data : null;
  // RLS で本人の行だけが読める。管理者でなければリンクの要素を作らない
  const isAdmin = loggedIn
    ? Boolean((await supabase.from("profiles").select("is_admin").eq("id", data!.claims.sub).maybeSingle()).data?.is_admin)
    : false;

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0">
          <Image src={logo} alt="VRPrintLab" priority className="h-9 w-auto sm:h-14" sizes="(min-width: 640px) 168px, 108px" />
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-4">
          <HeaderNav
            loggedIn={loggedIn}
            balance={balance ?? 0}
            adminTab={isAdmin ? <AdminNavLink variant="tab" /> : null}
            adminMenuItem={isAdmin ? <AdminNavLink variant="menu" /> : null}
          />
          <LanguageSwitcher variant="toggle" />
        </div>
      </div>
    </header>
  );
}
