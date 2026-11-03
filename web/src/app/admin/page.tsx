import Link from "next/link";
import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { RetryDeletionsForm } from "./forms";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });

export default async function AdminPage() {
  const admin = createAdminClient();
  const { data: pending, count } = await admin
    .from("storage_deletions")
    .select("id, bucket, path, prefix, reason, attempts, last_error, created_at", { count: "exact" })
    .is("done_at", null)
    .order("created_at")
    .limit(50);

  const { count: openReports } = await admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "open");

  return (
    <main className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">未対応の通報（{openReports ?? 0} 件）</h2>
        <Link href="/admin/reports" className="self-start text-sm font-semibold underline">
          通報を確認する
        </Link>
      </Card>

      <Card className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">ユーザーとトークン</h1>
        <p className="text-sm text-zinc-600">トークンの手動調整（二重消費・不具合の補填など）は、ユーザーの詳細画面から行います。</p>
        <Link href="/admin/users" className="self-start text-sm font-semibold underline">
          ユーザーを検索する
        </Link>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">未完了のファイル削除（{count ?? 0} 件）</h2>
        <p className="text-sm text-zinc-600">
          削除に失敗した Storage のファイルです。本番では1日1回自動で再試行します（10回失敗したものは自動では再試行しません）。
        </p>
        {pending && pending.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-3">記録日時</th>
                  <th className="py-1 pr-3">対象</th>
                  <th className="py-1 pr-3">理由</th>
                  <th className="py-1 pr-3">試行</th>
                  <th className="py-1">最後のエラー</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((d) => (
                  <tr key={d.id} className="border-t border-zinc-100 align-top">
                    <td className="whitespace-nowrap py-1 pr-3">{dateFormat.format(new Date(d.created_at))}</td>
                    <td className="break-all py-1 pr-3 font-mono">
                      {d.bucket}/{d.path}
                      {d.prefix && "/（フォルダごと）"}
                    </td>
                    <td className="py-1 pr-3">{d.reason}</td>
                    <td className="py-1 pr-3 tabular-nums">{d.attempts}</td>
                    <td className="break-all py-1 text-red-700">{d.last_error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <RetryDeletionsForm />
      </Card>
    </main>
  );
}
