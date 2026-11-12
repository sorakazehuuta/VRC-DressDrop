import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { balanceOfUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { tokenReasonLabels } from "@/lib/tokens/labels";
import { WORK_IMAGES_BUCKET } from "@/lib/works/constants";
import { setPurchaseSuspended, setUserStatus, setWorkStatus } from "../../actions";
import { AdjustTokensForm } from "../../forms";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  const [{ data: authUser }, { data: profile }, { data: deleted }, { data: transactions }, { data: purchases }, { data: payments }, { data: works }] =
    await Promise.all([
      admin.auth.admin.getUserById(id),
      admin.from("profiles").select("display_name, status, token_debt, is_admin, terms_version, terms_agreed_at").eq("id", id).maybeSingle(),
      admin.from("deleted_accounts").select("deleted_at").eq("user_id", id).maybeSingle(),
      admin
        .from("token_transactions")
        .select("id, delta, reason, ref_id, note, created_by, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("purchases")
        .select("id, work_name, template_name, token_spent, created_at, package_path, snapshot_deleted_at, suspended_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("payments")
        .select("id, amount_jpy, tokens, status, payment_method_type, terms_version, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("works").select("id, name, status, thumbnail_path, updated_at").eq("user_id", id).order("updated_at", { ascending: false }),
    ]);
  if (!profile && !deleted) notFound();
  const balance = profile ? await balanceOfUser(id) : 0;
  const thumbPaths = (works ?? []).flatMap((w) => (w.thumbnail_path ? [w.thumbnail_path] : []));
  const { data: thumbs } = thumbPaths.length ? await admin.storage.from(WORK_IMAGES_BUCKET).createSignedUrls(thumbPaths, 10 * 60) : { data: [] };
  const thumbByPath = new Map((thumbs ?? []).map((t) => [t.path, t.signedUrl]));

  return (
    <main className="flex flex-col gap-6">
      <nav className="text-sm text-zinc-500">
        <Link href="/admin/users" className="hover:underline">
          ← ユーザー
        </Link>
      </nav>
      <div>
        <h1 className="text-xl font-bold text-brand">{authUser?.user?.email ?? "（退会済み）"}</h1>
        <p className="font-mono text-xs text-zinc-500">{id}</p>
        <p className="text-sm text-zinc-600">
          {profile
            ? `${profile.display_name || "（表示名なし）"}・${profile.status === "suspended" ? "停止中" : "利用中"}・残高 ${balance}` +
              (profile.token_debt > 0 ? `（マイナス残高 ${profile.token_debt} を含む）` : "")
            : `${dateFormat.format(new Date(deleted!.deleted_at))} に退会`}
        </p>
        {profile && (
          <p className="text-xs text-zinc-500">
            同意した規約: {profile.terms_version ? `${profile.terms_version} 改定（${dateFormat.format(new Date(profile.terms_agreed_at))}）` : "記録なし"}
          </p>
        )}
        {profile && !profile.is_admin && (
          <form action={setUserStatus} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={id} />
            <input type="hidden" name="status" value={profile.status === "suspended" ? "active" : "suspended"} />
            <input name="note" placeholder="理由（記録に残ります）" maxLength={200} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
            <Button type="submit" variant={profile.status === "suspended" ? "secondary" : "danger"} className="!py-1.5">
              {profile.status === "suspended" ? "停止を解除" : "アカウントを停止"}
            </Button>
          </form>
        )}
      </div>

      {!!works?.length && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">作品</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {works.map((w) => {
              const thumb = w.thumbnail_path ? thumbByPath.get(w.thumbnail_path) : undefined;
              return (
                <li key={w.id} className="flex items-center gap-3 text-sm">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-14 w-18 shrink-0 rounded bg-zinc-100 object-cover" />
                  ) : (
                    <span className="h-14 w-18 shrink-0 rounded bg-zinc-100" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {w.name}
                    {w.status === "suspended" && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">公開停止中</span>}
                  </span>
                  <form action={setWorkStatus}>
                    <input type="hidden" name="workId" value={w.id} />
                    <input type="hidden" name="status" value={w.status === "suspended" ? "active" : "suspended"} />
                    <button type="submit" className="cursor-pointer text-xs text-red-600 hover:underline">
                      {w.status === "suspended" ? "解除" : "公開停止"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {profile && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">トークンの手動調整</h2>
          <p className="text-xs text-zinc-500">
            増やす場合は有効期限180日のトークンを付与し、減らす場合は有効期限が近いものから減らします。操作した管理者と理由が履歴に残ります。
          </p>
          <AdjustTokensForm userId={id} />
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">トークンの履歴（最新 100 件）</h2>
        <table className="w-full text-left text-xs">
          <tbody>
            {(transactions ?? []).map((t) => (
              <tr key={t.id} className="border-t border-zinc-100 align-top">
                <td className="whitespace-nowrap py-1 pr-3">{dateFormat.format(new Date(t.created_at))}</td>
                <td className="py-1 pr-3">{tokenReasonLabels[t.reason] ?? t.reason}</td>
                <td className={`py-1 pr-3 text-right tabular-nums ${t.delta < 0 ? "text-red-700" : ""}`}>{t.delta > 0 ? `+${t.delta}` : t.delta}</td>
                <td className="py-1 pr-3">{t.note}</td>
                <td className="py-1 font-mono text-[10px] text-zinc-400">
                  {t.ref_id && `ref ${t.ref_id}`}
                  {t.created_by && ` / by ${t.created_by}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">ダウンロード履歴</h2>
        <table className="w-full text-left text-xs">
          <tbody>
            {(purchases ?? []).map((p) => (
              <tr key={p.id} className="border-t border-zinc-100 align-top">
                <td className="whitespace-nowrap py-1 pr-3">{dateFormat.format(new Date(p.created_at))}</td>
                <td className="py-1 pr-3">
                  {p.work_name}（{p.template_name}）
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{p.token_spent}</td>
                <td className="py-1 pr-3">{p.package_path ? "控えあり" : p.snapshot_deleted_at ? "控え削除済み" : "控えなし"}</td>
                <td className="py-1 pr-3">
                  <form action={setPurchaseSuspended}>
                    <input type="hidden" name="purchaseId" value={p.id} />
                    <input type="hidden" name="suspend" value={p.suspended_at ? "0" : "1"} />
                    <button type="submit" className={`cursor-pointer hover:underline ${p.suspended_at ? "text-red-700" : "text-zinc-500"}`}>
                      {p.suspended_at ? "停止中（解除）" : "停止"}
                    </button>
                  </form>
                </td>
                <td className="py-1 font-mono text-[10px] text-zinc-400">{p.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">支払い</h2>
        <table className="w-full text-left text-xs">
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-t border-zinc-100 align-top">
                <td className="whitespace-nowrap py-1 pr-3">{dateFormat.format(new Date(p.created_at))}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {p.amount_jpy.toLocaleString()} 円 / {p.tokens} トークン
                </td>
                <td className="py-1 pr-3">{p.status}</td>
                <td className="py-1 pr-3">{p.payment_method_type}</td>
                <td className="py-1 pr-3 text-zinc-500">{p.terms_version && `規約 ${p.terms_version}`}</td>
                <td className="py-1 font-mono text-[10px] text-zinc-400">{p.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
