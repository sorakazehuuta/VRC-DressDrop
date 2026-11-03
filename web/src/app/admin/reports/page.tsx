import Link from "next/link";
import { reportCategories, reportStatusLabels, type ReportCategory } from "@/lib/reports";
import { createAdminClient } from "@/lib/supabase/server";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const raw = (await searchParams).status;
  const status = raw === "resolved" || raw === "dismissed" || raw === "all" ? raw : "open";
  let query = createAdminClient()
    .from("reports")
    .select("id, category, reason, status, purchase_id, purchase_ref, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: reports } = await query;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">通報</h1>
      <nav className="flex gap-3 text-sm">
        {(["open", "resolved", "dismissed", "all"] as const).map((s) => (
          <Link key={s} href={`/admin/reports?status=${s}`} className={s === status ? "font-semibold underline" : "text-zinc-600 hover:underline"}>
            {s === "all" ? "すべて" : reportStatusLabels[s]}
          </Link>
        ))}
      </nav>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white text-sm">
        {(reports ?? []).map((r) => (
          <li key={r.id}>
            <Link href={`/admin/reports/${r.id}`} className="flex flex-col gap-1 p-3 hover:bg-zinc-50">
              <span className="flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
                {dateFormat.format(new Date(r.created_at))}
                <span className="rounded bg-zinc-100 px-1.5 text-zinc-700">{reportStatusLabels[r.status]}</span>
                <span>{reportCategories[r.category as ReportCategory] ?? r.category}</span>
                {r.purchase_id ? <span className="text-accent-dark">作品を特定済み</span> : r.purchase_ref && <span className="text-amber-700">取得 ID が一致しない</span>}
              </span>
              <span className="line-clamp-2">{r.reason}</span>
            </Link>
          </li>
        ))}
        {!reports?.length && <li className="p-3 text-zinc-500">通報はありません。</li>}
      </ul>
    </main>
  );
}
