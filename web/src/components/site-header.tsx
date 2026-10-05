import Image from "next/image";
import Link from "next/link";
import logo from "../../images/common/logos/VRPrintLab_logo.png";
import { createClient } from "@/lib/supabase/server";
import { HeaderNav } from "./header-nav";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const balance = loggedIn ? (await supabase.rpc("get_token_balance")).data : null;

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0">
          <Image src={logo} alt="VRPrintLab" priority className="h-9 w-auto sm:h-14" sizes="(min-width: 640px) 168px, 108px" />
        </Link>
        <HeaderNav loggedIn={loggedIn} balance={balance ?? 0} />
      </div>
    </header>
  );
}
