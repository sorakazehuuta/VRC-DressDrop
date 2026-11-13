import Link from "next/link";
import { Button } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" });

type UserRow = { id: string; email: string | null; display_name: string; status: string; is_admin: boolean; created_at: string };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw : "";
  const { data, error } = await createAdminClient().rpc("admin_search_users", { p_query: q });
  const users = (data ?? []) as UserRow[];

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">ユーザー</h1>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="メールアドレス・表示名・ユーザー ID"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary">
          検索
        </Button>
      </form>
      {error && <p className="text-sm text-red-700">検索できませんでした: {error.message}</p>}
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white text-sm">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-zinc-50">
              <span className="font-medium">{u.email ?? "（メールなし）"}</span>
              <span className="text-zinc-500">{u.display_name}</span>
              {u.status === "suspended" && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">停止中</span>}
              {u.is_admin && <span className="rounded bg-zinc-100 px-1.5 text-xs">管理者</span>}
              <span className="ml-auto text-xs text-zinc-500">{dateFormat.format(new Date(u.created_at))} 登録</span>
            </Link>
          </li>
        ))}
        {users.length === 0 && <li className="p-3 text-zinc-500">見つかりません。</li>}
      </ul>
      <p className="text-xs text-zinc-500">最大 50 件まで表示します。退会したユーザーは、ユーザー ID で /admin/users/&lt;ID&gt; を開くと記録を確認できます。</p>
    </main>
  );
}
