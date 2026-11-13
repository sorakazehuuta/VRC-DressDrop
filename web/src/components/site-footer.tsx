import Link from "@/i18n/link";
import { getMessages } from "@/i18n/server";
import { LanguageSwitcher } from "./language-switcher";
import { commonMessages } from "./messages";

export async function SiteFooter() {
  const m = (await getMessages(commonMessages)).footer;
  const links = [
    { href: "/news", label: m.news },
    { href: "/guide", label: m.guide },
    { href: "/faq", label: m.faq },
    { href: "/terms", label: m.terms },
    { href: "/privacy", label: m.privacy },
    { href: "/tokushoho", label: m.tokushoho },
  ];
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={m.label}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <LanguageSwitcher />
          <p className="text-xs text-zinc-500">© VRPrintLab</p>
        </div>
      </div>
    </footer>
  );
}
