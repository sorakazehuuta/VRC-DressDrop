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
    <footer className="bg-brand text-white/80">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={m.label}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <LanguageSwitcher tone="dark" />
          <p className="text-xs text-white/60">© VRPrintLab</p>
        </div>
      </div>
    </footer>
  );
}
