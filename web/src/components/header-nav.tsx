"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useMessages, usePathWithoutLocale } from "@/i18n/client";
import Link from "@/i18n/link";
import { LogoutButton } from "./logout-button";
import { commonMessages } from "./messages";

type NavItem = { href: string; label: string; match: string[] };
type NavMessages = (typeof commonMessages)["ja"]["nav"];

// match: このタブをハイライトするパスの先頭（エディタはテンプレート、ダウンロード履歴はマイ作品の一部として扱う。
// 保存済みの作品を開いたエディタは、currentPath で /works/edit に読み替えてマイ作品に含める）
const navItems = (m: NavMessages) => ({
  TEMPLATES: { href: "/templates", label: m.templates, match: ["/templates", "/editor"] },
  WORKS: { href: "/works", label: m.works, match: ["/works", "/downloads"] },
  ACCOUNT: { href: "/account", label: m.account, match: ["/account"] },
});

const isActive = (pathname: string, item: NavItem) => item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));

function TabLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative py-1 font-medium after:absolute after:inset-x-0 after:-bottom-[13px] after:h-0.5 after:rounded-full ${
        active ? "text-accent-dark after:bg-accent" : "hover:text-accent-dark"
      }`}
    >
      {item.label}
    </Link>
  );
}

// adminTab / adminMenuItem: 管理者のときだけサーバーで描画して渡す要素（このファイルには管理画面の URL を書かない）
type HeaderNavProps = { loggedIn: boolean; balance: number; adminTab?: ReactNode; adminMenuItem?: ReactNode };

// useSearchParams は静的に書き出すページで Suspense が必要なため、読めない間は ?work= がないものとして表示する
export function HeaderNav(props: HeaderNavProps) {
  return (
    <Suspense fallback={<Nav {...props} editingWork={false} />}>
      <NavWithSearchParams {...props} />
    </Suspense>
  );
}

function NavWithSearchParams(props: HeaderNavProps) {
  const editingWork = useSearchParams().has("work");
  return <Nav {...props} editingWork={editingWork} />;
}

function Nav({ loggedIn, balance, adminTab, adminMenuItem, editingWork }: HeaderNavProps & { editingWork: boolean }) {
  const m = useMessages(commonMessages).nav;
  const { TEMPLATES, WORKS, ACCOUNT } = navItems(m);
  const rawPath = usePathWithoutLocale();
  const pathname = editingWork && rawPath.startsWith("/editor/") ? "/works/edit" : rawPath;

  if (!loggedIn) {
    return (
      <nav className="flex items-center gap-2.5 whitespace-nowrap text-xs sm:gap-5 sm:text-sm">
        <TabLink item={TEMPLATES} pathname={pathname} />
        <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined} className={pathname === "/login" ? "font-medium text-accent-dark" : "hover:text-accent-dark"}>
          {m.login}
        </Link>
        <Link href="/signup" className="rounded-md bg-brand px-2.5 py-1.5 font-semibold text-white hover:bg-brand-light sm:px-3">
          {m.signup}
        </Link>
      </nav>
    );
  }

  const tokenChip = (
    <Link
      href="/tokens"
      aria-current={pathname === "/tokens" ? "page" : undefined}
      className={`rounded-full px-3 py-1 font-semibold tabular-nums ${balance < 0 ? "bg-red-50 text-red-700" : "bg-accent-soft text-accent-dark"}`}
    >
      {m.tokens(balance)}
    </Link>
  );

  return (
    <>
      <nav className="hidden items-center gap-5 whitespace-nowrap text-sm sm:flex">
        <TabLink item={TEMPLATES} pathname={pathname} />
        <TabLink item={WORKS} pathname={pathname} />
        {tokenChip}
        <TabLink item={ACCOUNT} pathname={pathname} />
        {adminTab}
        <LogoutButton className="cursor-pointer text-zinc-600 hover:underline" />
      </nav>
      <div className="flex items-center gap-2 text-xs sm:hidden">
        {tokenChip}
        <MobileMenu pathname={pathname} adminMenuItem={adminMenuItem} m={m} />
      </div>
    </>
  );
}

// スマホ幅ではタブを並べきれないため、メニューボタンの中にまとめる
function MobileMenu({ pathname, adminMenuItem, m }: { pathname: string; adminMenuItem?: ReactNode; m: NavMessages }) {
  const { TEMPLATES, WORKS, ACCOUNT } = navItems(m);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // ページを移動したら閉じる
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      // メニューから開いたログアウトの確認ダイアログの操作では閉じない
      if (!rootRef.current?.contains(target) && !target.closest("[data-dialog-root]")) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items: NavItem[] = [TEMPLATES, { ...WORKS, match: ["/works"] }, { href: "/downloads", label: m.downloads, match: ["/downloads"] }, ACCOUNT];

  return (
    <div ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={m.menu}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-zinc-100"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full border-b border-zinc-200 bg-white shadow-md">
          <ul className="flex flex-col py-2 text-sm">
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block border-l-4 px-4 py-3 ${active ? "border-accent bg-accent-soft/50 font-semibold text-accent-dark" : "border-transparent hover:bg-zinc-50"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {adminMenuItem && <li>{adminMenuItem}</li>}
            <li className="mt-1 border-t border-zinc-100 pt-1">
              <LogoutButton className="block w-full cursor-pointer border-l-4 border-transparent px-4 py-3 text-left text-zinc-600 hover:bg-zinc-50" />
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
