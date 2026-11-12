import Link from "next/link";
import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";

type MonthRow = {
  month: string;
  sales_jpy: number;
  payments: number;
  refunded_jpy: number;
  downloads: number;
  paid_downloads: number;
  tokens_spent: number;
  signups: number;
  withdrawals: number;
};
type SharedCard = { card_fingerprint: string; user_ids: string[]; payments: number; blocked: boolean; last_used_at: string };

const yen = (n: number) => `${Number(n).toLocaleString()} 円`;
const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" });

// 0 件のときはリンクにしない
function CountLink({ month, tab, count }: { month: string; tab: string; count: number }) {
  if (!count) return <>{count}</>;
  return (
    <Link href={`/admin/stats/${month}?tab=${tab}`} className="underline decoration-zinc-300 hover:decoration-zinc-600">
      {count}
    </Link>
  );
}

export default async function AdminStatsPage() {
  const admin = createAdminClient();
  const [{ data: months }, { data: cards }] = await Promise.all([admin.rpc("admin_monthly_stats", { p_months: 12 }), admin.rpc("admin_shared_cards")]);
  const rows = (months ?? []) as MonthRow[];
  const shared = (cards ?? []) as SharedCard[];

  return (
    <main className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">月ごとの集計（直近12か月）</h1>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 text-left">月</th>
                <th className="py-1">売上</th>
                <th className="py-1">支払い</th>
                <th className="py-1">返金・取り消し</th>
                <th className="py-1">ダウンロード</th>
                <th className="py-1">うち有料</th>
                <th className="py-1">使われたトークン</th>
                <th className="py-1">新規登録</th>
                <th className="py-1">退会</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-t border-zinc-100">
                  <td className="py-1 text-left">
                    <Link href={`/admin/stats/${r.month}`} className="underline">
                      {r.month}
                    </Link>
                  </td>
                  <td className="py-1">{yen(r.sales_jpy)}</td>
                  <td className="py-1">
                    <CountLink month={r.month} tab="payments" count={r.payments} />
                  </td>
                  <td className="py-1">{yen(r.refunded_jpy)}</td>
                  <td className="py-1">
                    <CountLink month={r.month} tab="downloads" count={r.downloads} />
                  </td>
                  <td className="py-1">{r.paid_downloads}</td>
                  <td className="py-1">{r.tokens_spent}</td>
                  <td className="py-1">
                    <CountLink month={r.month} tab="signups" count={r.signups} />
                  </td>
                  <td className="py-1">
                    <CountLink month={r.month} tab="withdrawals" count={r.withdrawals} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          月を押すと、その月の新規登録・退会・支払い・ダウンロードの一覧を見られます。新規登録は今も登録中の人数で、あとで退会した人は含みません。売上は入金済みの支払い（日本時間の入金月）。返金・取り消しは、その後に返金・チャージバックになった支払いの金額。ダウンロードは、トークンを使ったダウンロード内容の数（同じ内容の再ダウンロードは含まない）。
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">同じカードを使っている複数のアカウント</h2>
        {shared.length === 0 ? (
          <p className="text-sm text-zinc-600">ありません。</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {shared.map((c) => (
              <li key={c.card_fingerprint} className="flex flex-col gap-1 py-2">
                <span className="text-xs text-zinc-500">
                  カード {c.card_fingerprint.slice(0, 8)}…・{c.payments} 件の支払い・最終 {dateFormat.format(new Date(c.last_used_at))}
                  {c.blocked && <span className="ml-2 rounded bg-red-100 px-1.5 text-red-700">ブロック済み</span>}
                </span>
                <span className="flex flex-wrap gap-3">
                  {c.user_ids.map((u) => (
                    <Link key={u} href={`/admin/users/${u}`} className="font-mono text-xs underline">
                      {u}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-zinc-500">電話番号での確認は、SMS での確認を導入してから追加します。</p>
      </Card>
    </main>
  );
}
