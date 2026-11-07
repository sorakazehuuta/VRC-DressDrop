import Link from "next/link";

const links = [
  { href: "/guide", label: "導入ガイド" },
  { href: "/faq", label: "よくある質問" },
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/tokushoho", label: "特定商取引法に基づく表記" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="サイト情報">
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
        <p className="text-xs text-zinc-500">© VRPrintLab</p>
      </div>
    </footer>
  );
}
