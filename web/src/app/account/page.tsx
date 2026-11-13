import type { Metadata } from "next";
import { LogoutButton } from "@/components/logout-button";
import { buttonClassName } from "@/components/ui";
import Link from "@/i18n/link";
import { formatDate } from "@/i18n/format";
import { getLocale, getMessages } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm, DisplayNameForm } from "./forms";
import { accountMessages } from "./messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(accountMessages)).title} | VRPrintLab` };
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const locale = await getLocale();
  const m = pick(accountMessages, locale);

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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-10 pb-16">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.75rem] font-extrabold text-brand">{m.title}</h1>
        <LogoutButton className={buttonClassName("secondary", "shrink-0 whitespace-nowrap")} />
      </div>

      <section className="flex flex-col gap-2 border-l-4 border-accent pl-4">
        <h2 className="text-sm font-semibold text-zinc-600">{m.tokens.heading}</h2>
        <p className="text-4xl font-extrabold tabular-nums text-brand">
          {balance ?? 0}
          <span className="ml-1.5 text-base font-semibold text-zinc-500">{m.tokens.unit}</span>
        </p>
        {nextExpiry && (
          <p className="text-sm text-zinc-600">
            {m.tokens.nextExpiry(nextExpiry.remaining, formatDate(locale, nextExpiry.expires_at))}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <Link href="/tokens" className={buttonClassName("accent")}>
            {m.tokens.buy}
          </Link>
          <Link href="/downloads" className="text-sm font-semibold text-accent-dark underline">
            {m.tokens.downloads}
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-zinc-200 pt-6">
        <h2 className="text-xl font-bold text-brand">{m.profile.heading}</h2>
        <p className="text-sm">
          <span className="text-zinc-500">{m.profile.email}</span>
          {user.email}
        </p>
        <DisplayNameForm defaultValue={profile?.display_name ?? ""} />
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6">
        <h2 className="text-xl font-bold text-brand">{m.password.heading}</h2>
        <p className="text-sm text-zinc-600">
          {hasPassword ? m.password.hasPassword : m.password.noPassword}
        </p>
        <Link href="/account/password" className="self-start text-sm font-semibold underline">
          {hasPassword ? m.password.change : m.password.set}
        </Link>
      </section>

      <section className="flex flex-col gap-3 border-t border-red-200 pt-6">
        <h2 className="text-xl font-bold text-red-700">{m.delete.heading}</h2>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-600">
          <p>{m.delete.warning}</p>
          <div>
            <p className="font-semibold text-zinc-800">{m.delete.deletedHeading}</p>
            <ul className="list-disc pl-5">
              {m.delete.deleted.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-zinc-800">{m.delete.keptHeading}</p>
            <ul className="list-disc pl-5">
              {m.delete.kept.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p>
            {m.delete.pending1}
            <Link href="/terms" className="underline">
              {m.delete.termsLink}
            </Link>
            {m.delete.pending2}
          </p>
        </div>
        <DeleteAccountForm />
      </section>
    </main>
  );
}
