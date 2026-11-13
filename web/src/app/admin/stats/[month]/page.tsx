import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui";
import { monthRange, monthsAgo } from "@/lib/admin-month";
import { createAdminClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;
const yen = (n: number) => `${Number(n).toLocaleString()} 円`;
const dateTime = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

const TABS = { signups: "新規登録", withdrawals: "退会", payments: "支払い", downloads: "ダウンロード" } as const;
type Tab = keyof typeof TABS;

const paymentStatus: Record<string, { label: string; className: string }> = {
  completed: { label: "入金済み", className: "text-zinc-600" },
  refunded: { label: "返金", className: "text-red-700" },
  disputed: { label: "チャージバック", className: "text-red-700" },
};
const methodLabel: Record<string, string> = { card: "カード", konbini: "コンビニ" };

type Summary = { sales_jpy: number; payments: number; refunded_jpy: number; downloads: number; paid_downloads: number; tokens_spent: number; signups: number; withdrawals: number };

export default async function AdminMonthPage({ params, searchParams }: PageProps<"/admin/stats/[month]">) {
  const range = monthRange((await params).month);
  if (!range) notFound();
  const ago = monthsAgo(range.month);
  if (ago < 0 || ago > 120) notFound();
  const query = await searchParams;
  const tab: Tab = typeof query.tab === "string" && query.tab in TABS ? (query.tab as Tab) : "signups";
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  const { data: months } = await admin.rpc("admin_monthly_stats", { p_months: ago + 1 });
  const summary = ((months ?? []) as (Summary & { month: string })[]).find((m) => m.month === range.month);
  const list = await loadList(tab, range, from);
  // メールアドレスは auth.users にあり、退会すると消える。「退会済み」は退会の記録があるときだけ出す
  const ids = [...new Set(list.userIds)];
  const [{ data: emails, error: emailError }, { data: deleted }] = ids.length
    ? await Promise.all([admin.rpc("admin_user_emails", { p_ids: ids }), admin.from("deleted_accounts").select("user_id").in("user_id", ids)])
    : [{ data: [], error: null }, { data: [] }];
  const emailOf = new Map(((emails ?? []) as { id: string; email: string }[]).map((e) => [e.id, e.email]));
  const deletedIds = new Set((deleted ?? []).map((d) => d.user_id));
  const user = (id: string) => (
    <Link href={`/admin/users/${id}`} className="underline decoration-zinc-300 hover:decoration-zinc-600">
      {emailOf.get(id) ?? (deletedIds.has(id) ? "（退会済み）" : <span className="font-mono text-xs">{id}</span>)}
    </Link>
  );
  const tabHref = (t: Tab, p = 1) => `/admin/stats/${range.month}?tab=${t}${p > 1 ? `&page=${p}` : ""}`;
  const tabCount: Record<Tab, number> = { signups: summary?.signups ?? 0, withdrawals: summary?.withdrawals ?? 0, payments: summary?.payments ?? 0, downloads: summary?.downloads ?? 0 };

  return (
    <main className="flex flex-col gap-6">
      <nav className="flex items-center justify-between text-sm text-zinc-500">
        <Link href="/admin/stats" className="hover:underline">
          ← 集計
        </Link>
        <span className="flex gap-4">
          <Link href={`/admin/stats/${range.prev}?tab=${tab}`} className="hover:underline">
            ‹ 前の月
          </Link>
          {ago > 0 && (
            <Link href={`/admin/stats/${range.next}?tab=${tab}`} className="hover:underline">
              次の月 ›
            </Link>
          )}
        </span>
      </nav>
      <h1 className="text-xl font-bold text-brand">{range.label}の詳細</h1>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["売上", yen(summary?.sales_jpy ?? 0), `支払い ${summary?.payments ?? 0} 件`],
          ["返金・取り消し", yen(summary?.refunded_jpy ?? 0), ""],
          ["ダウンロード", `${summary?.downloads ?? 0} 件`, `うち有料 ${summary?.paid_downloads ?? 0}・トークン ${summary?.tokens_spent ?? 0}`],
          ["新規登録", `${summary?.signups ?? 0} 人`, ""],
          ["退会", `${summary?.withdrawals ?? 0} 人`, ""],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-3">
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            {note && <dd className="text-xs text-zinc-500">{note}</dd>}
          </div>
        ))}
      </dl>

      <Section className="flex flex-col gap-4">
        <div role="tablist" className="flex flex-wrap gap-2">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              role="tab"
              aria-selected={t === tab}
              className={`rounded-full border px-3 py-1 text-sm ${t === tab ? "border-accent bg-accent-soft font-semibold text-accent-dark" : "border-zinc-200 text-zinc-600 hover:border-zinc-400"}`}
            >
              {TABS[t]} <span className="tabular-nums">{tabCount[t]}</span>
            </Link>
          ))}
        </div>

        {emailError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            メールアドレスを読めなかったため、ユーザー ID で表示しています（{emailError.message}）。マイグレーション 20261112000000_admin_month_detail.sql を実行したか確認してください。
          </p>
        )}
        {list.breakdown}

        {list.total === 0 ? (
          <p className="text-sm text-zinc-500">この月の{TABS[tab]}はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  {list.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap py-1 pr-4 font-normal">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.key} className="border-t border-zinc-100 align-top">
                    {r.cells(user).map((cell, i) => (
                      <td key={i} className={`whitespace-nowrap py-1.5 pr-4 ${i === 0 ? "tabular-nums text-zinc-500" : ""}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 tabular-nums">
              {list.total} 件中 {from + 1}〜{Math.min(from + PAGE_SIZE, list.total)} 件
            </span>
            <span className="flex gap-4">
              {page > 1 && (
                <Link href={tabHref(tab, page - 1)} className="underline">
                  前の {PAGE_SIZE} 件
                </Link>
              )}
              {from + PAGE_SIZE < list.total && (
                <Link href={tabHref(tab, page + 1)} className="underline">
                  次の {PAGE_SIZE} 件
                </Link>
              )}
            </span>
          </div>
        )}
      </Section>
    </main>
  );
}

type Row = { key: string; cells: (user: (id: string) => React.ReactNode) => React.ReactNode[] };

// タブごとの一覧（新しい順、PAGE_SIZE 件ずつ）と、件数が多くても全体がわかる内訳
async function loadList(tab: Tab, range: NonNullable<ReturnType<typeof monthRange>>, from: number) {
  const admin = createAdminClient();
  const to = from + PAGE_SIZE - 1;

  if (tab === "signups") {
    const { data, count } = await admin
      .from("profiles")
      .select("id, display_name, status, is_admin, created_at", { count: "exact" })
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("created_at", { ascending: false })
      .range(from, to);
    return {
      total: count ?? 0,
      userIds: (data ?? []).map((u) => u.id),
      breakdown: null,
      columns: ["登録日時", "メールアドレス", "表示名", ""],
      rows: (data ?? []).map<Row>((u) => ({
        key: u.id,
        cells: (user) => [
          dateTime.format(new Date(u.created_at)),
          user(u.id),
          u.display_name || <span className="text-zinc-400">（なし）</span>,
          <span key="badges" className="flex gap-1 text-xs">
            {u.status === "suspended" && <span className="rounded bg-red-100 px-1.5 text-red-700">停止中</span>}
            {u.is_admin && <span className="rounded bg-zinc-100 px-1.5">管理者</span>}
          </span>,
        ],
      })),
    };
  }

  if (tab === "withdrawals") {
    // 退会するとメールアドレス・表示名は消えるため、ユーザー ID で表示する（詳細ページで支払い・ダウンロードの記録を見られる）
    const { data, count } = await admin
      .from("deleted_accounts")
      .select("user_id, deleted_at", { count: "exact" })
      .gte("deleted_at", range.start)
      .lt("deleted_at", range.end)
      .order("deleted_at", { ascending: false })
      .range(from, to);
    return {
      total: count ?? 0,
      userIds: [],
      breakdown: null,
      columns: ["退会日時", "ユーザー ID"],
      rows: (data ?? []).map<Row>((d) => ({
        key: d.user_id,
        cells: () => [
          dateTime.format(new Date(d.deleted_at)),
          <Link key="id" href={`/admin/users/${d.user_id}`} className="font-mono text-xs underline decoration-zinc-300 hover:decoration-zinc-600">
            {d.user_id}
          </Link>,
        ],
      })),
    };
  }

  if (tab === "payments") {
    // admin_monthly_stats と同じく、入金日（なければ作成日）の月で数える
    const inMonth = `and(completed_at.gte.${range.start},completed_at.lt.${range.end}),and(completed_at.is.null,created_at.gte.${range.start},created_at.lt.${range.end})`;
    const [{ data, count }, { data: packs }] = await Promise.all([
      admin
        .from("payments")
        .select("id, user_id, amount_jpy, tokens, status, payment_method_type, created_at, completed_at, token_packs(name)", { count: "exact" })
        .in("status", ["completed", "refunded", "disputed"])
        .or(inMonth)
        .order("created_at", { ascending: false })
        .range(from, to),
      admin.rpc("admin_month_payments_by_pack", { p_month: range.month }),
    ]);
    const byPack = (packs ?? []) as { pack_name: string; payments: number; sales_jpy: number; refunded_jpy: number }[];
    return {
      total: count ?? 0,
      userIds: (data ?? []).map((p) => p.user_id),
      breakdown: byPack.length > 0 && (
        <Breakdown
          title="パックごと"
          items={byPack.map((k) => ({ label: k.pack_name, value: `${k.payments} 件・${yen(k.sales_jpy)}${k.refunded_jpy ? `（返金 ${yen(k.refunded_jpy)}）` : ""}` }))}
        />
      ),
      columns: ["日時", "メールアドレス", "内容", "方法", "状態"],
      rows: (data ?? []).map<Row>((p) => {
        const status = paymentStatus[p.status] ?? { label: p.status, className: "" };
        const pack = (p.token_packs as unknown as { name: string } | null)?.name;
        return {
          key: p.id,
          cells: (user) => [
            dateTime.format(new Date(p.completed_at ?? p.created_at)),
            user(p.user_id),
            <span key="pack" className="tabular-nums">
              {pack ?? `${p.tokens} トークン`}・{yen(p.amount_jpy)}
            </span>,
            methodLabel[p.payment_method_type ?? ""] ?? p.payment_method_type ?? "",
            <span key="status" className={status.className}>
              {status.label}
            </span>,
          ],
        };
      }),
    };
  }

  const [{ data, count }, { data: templates }] = await Promise.all([
    admin
      .from("purchases")
      .select("id, user_id, work_name, template_name, token_spent, suspended_at, created_at", { count: "exact" })
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("created_at", { ascending: false })
      .range(from, to),
    admin.rpc("admin_month_downloads_by_template", { p_month: range.month }),
  ]);
  const byTemplate = (templates ?? []) as { template_name: string; downloads: number; paid_downloads: number; tokens_spent: number }[];
  return {
    total: count ?? 0,
    userIds: (data ?? []).map((p) => p.user_id),
    breakdown: byTemplate.length > 0 && (
      <Breakdown title="テンプレートごと" items={byTemplate.map((t) => ({ label: t.template_name, value: `${t.downloads} 件・${t.tokens_spent} トークン` }))} />
    ),
    columns: ["日時", "メールアドレス", "作品", "テンプレート", "トークン"],
    rows: (data ?? []).map<Row>((p) => ({
      key: p.id,
      cells: (user) => [
        dateTime.format(new Date(p.created_at)),
        user(p.user_id),
        <span key="work">
          {p.work_name}
          {p.suspended_at && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">停止中</span>}
        </span>,
        p.template_name,
        <span key="tokens" className="tabular-nums">
          {p.token_spent > 0 ? p.token_spent : <span className="text-zinc-400">無料</span>}
        </span>,
      ],
    })),
  };
}

// 内訳は折りたたまず、横に並べて一目で見られるようにする
function Breakdown({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs text-zinc-500">{title}</h2>
      <ul className="flex flex-wrap gap-2 text-sm">
        {items.map((i) => (
          <li key={i.label} className="rounded-lg bg-zinc-50 px-2 py-1">
            <span className="font-medium">{i.label}</span> <span className="text-zinc-600 tabular-nums">{i.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
