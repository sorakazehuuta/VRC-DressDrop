import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RedownloadButton } from "./redownload-button";

export const metadata: Metadata = { title: "ダウンロード履歴 | VRPrintLab" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });

export default async function DownloadsPage() {
  const user = await requireUser("/downloads");
  const supabase = await createClient();
  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, work_id, work_name, template_name, token_spent, created_at, package_path")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold text-brand">ダウンロード履歴</h1>
        <p className="text-sm text-zinc-500">購入した版は、作品を編集・削除したあとでも何度でも無料でダウンロードできます。</p>
      </div>

      {!purchases?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-zinc-50 p-10 text-center">
          <p className="text-zinc-600">まだダウンロードした作品はありません。</p>
          <Link href="/works" className="font-semibold text-accent-dark underline">
            マイ作品を開く
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {purchases.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-brand">{p.work_name || "（名前なし）"}</p>
                <p className="text-xs text-zinc-500">
                  {p.template_name}・{dateFormat.format(new Date(p.created_at))}・{p.token_spent} トークン
                  {!p.work_id && "・作品は削除済み"}
                </p>
              </div>
              {p.package_path && <RedownloadButton purchaseId={p.id} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
