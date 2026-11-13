import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { AdminNavLinks } from "./admin-nav";

export const metadata: Metadata = { title: "管理画面 | VRPrintLab", robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-8 pb-16">
      <nav className="flex flex-wrap items-center gap-4 border-b border-zinc-200 pb-3 text-sm">
        <span className="font-bold text-brand">管理画面</span>
        <AdminNavLinks
          items={[
            { href: "/admin", label: "概要", exact: true },
            { href: "/admin/users", label: "ユーザー" },
            { href: "/admin/catalog", label: "テンプレート・ギミック" },
            { href: "/admin/stats", label: "集計" },
          ]}
        />
      </nav>
      {children}
    </div>
  );
}
