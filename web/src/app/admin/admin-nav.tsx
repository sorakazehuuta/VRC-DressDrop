"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 管理画面のタブ。開いているページのタブに下線を引く（URL はレイアウトから渡す）
export function AdminNavLinks({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return items.map((item) => {
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`relative py-1 font-medium after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 sm:after:-bottom-[13px] after:rounded-full ${
          active ? "text-accent-dark after:bg-accent" : "text-zinc-600 hover:text-accent-dark"
        }`}
      >
        {item.label}
      </Link>
    );
  });
}
