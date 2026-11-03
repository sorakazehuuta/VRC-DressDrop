import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "管理画面 | VRPrintLab", robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <nav className="flex flex-wrap items-center gap-4 border-b border-zinc-200 pb-3 text-sm">
        <span className="font-bold text-brand">管理画面</span>
        <Link href="/admin" className="hover:underline">
          概要
        </Link>
        <Link href="/admin/users" className="hover:underline">
          ユーザー
        </Link>
      </nav>
      {children}
    </div>
  );
}
