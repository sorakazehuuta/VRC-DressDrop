import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { reportCategories, reportStatusLabels, type ReportCategory } from "@/lib/reports";
import { createAdminClient } from "@/lib/supabase/server";
import { WORK_IMAGES_BUCKET } from "@/lib/works/constants";
import { resolveReport, setPurchaseSuspended, setUserStatus, setWorkStatus } from "../../actions";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });
const inputClass = "rounded-md border border-zinc-300 px-3 py-2 text-sm";

export default async function AdminReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  const { data: report } = await admin.from("reports").select("*").eq("id", id).maybeSingle();
  if (!report) notFound();

  const { data: purchase } = report.purchase_id
    ? await admin
        .from("purchases")
        .select("id, user_id, work_id, work_name, template_name, created_at, thumbnail_path, snapshot, suspended_at")
        .eq("id", report.purchase_id)
        .maybeSingle()
    : { data: null };
  const workId = purchase?.work_id ?? report.work_id;
  const { data: work } = workId ? await admin.from("works").select("id, name, status, thumbnail_path").eq("id", workId).maybeSingle() : { data: null };
  const userId = purchase?.user_id as string | undefined;
  const [{ data: owner }, { data: profile }] = userId
    ? await Promise.all([admin.auth.admin.getUserById(userId), admin.from("profiles").select("status").eq("id", userId).maybeSingle()])
    : [{ data: null }, { data: null }];

  // 運営が中身を確認できるよう、作品と購入した版の画像を期限付きのリンクで出す
  const snapshotImages = Object.values(((purchase?.snapshot as { images?: Record<string, string> } | null)?.images ?? {}) as Record<string, string>);
  const packagePaths = [...(purchase?.thumbnail_path ? [purchase.thumbnail_path] : []), ...snapshotImages];
  const { data: packageUrls } = packagePaths.length ? await admin.storage.from("packages").createSignedUrls(packagePaths, 10 * 60) : { data: [] };
  const { data: workThumb } = work?.thumbnail_path ? await admin.storage.from(WORK_IMAGES_BUCKET).createSignedUrl(work.thumbnail_path, 10 * 60) : { data: null };
  const images = [...(workThumb ? [{ label: "現在の作品", url: workThumb.signedUrl }] : []), ...(packageUrls ?? []).flatMap((u) => (u.signedUrl ? [{ label: "購入した版", url: u.signedUrl }] : []))];

  return (
    <main className="flex flex-col gap-6">
      <nav className="text-sm text-zinc-500">
        <Link href="/admin/reports" className="hover:underline">
          ← 通報
        </Link>
      </nav>
      <Card className="flex flex-col gap-2 text-sm">
        <p className="text-xs text-zinc-500">
          {dateFormat.format(new Date(report.created_at))}・{reportStatusLabels[report.status]}
          {report.reporter_id ? "・ログインユーザーから" : "・ログインなし"}
        </p>
        <h1 className="text-lg font-semibold">{reportCategories[report.category as ReportCategory] ?? report.category}</h1>
        <p className="whitespace-pre-wrap">{report.reason}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-zinc-500">取得 ID</dt>
          <dd className="font-mono break-all">{report.purchase_ref || "（なし）"}</dd>
          <dt className="text-zinc-500">見かけた場所</dt>
          <dd className="break-all">{report.location || "（なし）"}</dd>
          <dt className="text-zinc-500">連絡先</dt>
          <dd>{report.contact_email || "（なし）"}</dd>
        </dl>
      </Card>

      <Card className="flex flex-col gap-3 text-sm">
        <h2 className="text-lg font-semibold">対象</h2>
        {!purchase && !work && <p className="text-zinc-600">取得 ID から作品を特定できませんでした。内容と見かけた場所から確認してください。</p>}
        {purchase && (
          <p>
            購入した版: {purchase.work_name}（{purchase.template_name}）・{dateFormat.format(new Date(purchase.created_at))}
            {purchase.suspended_at && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">停止中</span>}
          </p>
        )}
        {work && (
          <p>
            作品: {work.name}
            {work.status === "suspended" && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">公開停止中</span>}
          </p>
        )}
        {userId && (
          <p>
            作成者:{" "}
            <Link href={`/admin/users/${userId}`} className="underline">
              {owner?.user?.email ?? "（退会済み）"}
            </Link>
            {profile?.status === "suspended" && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">停止中</span>}
          </p>
        )}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {images.map((img) => (
              <figure key={img.url} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-32 w-32 rounded border border-zinc-200 bg-zinc-50 object-contain" />
                <figcaption className="text-xs text-zinc-500">{img.label}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {purchase && (
            <form action={setPurchaseSuspended}>
              <input type="hidden" name="purchaseId" value={purchase.id} />
              <input type="hidden" name="suspend" value={purchase.suspended_at ? "0" : "1"} />
              <input type="hidden" name="note" value={`通報 ${report.id}`} />
              <Button type="submit" variant={purchase.suspended_at ? "secondary" : "danger"}>
                {purchase.suspended_at ? "版の停止を解除" : "この版の再ダウンロードを停止"}
              </Button>
            </form>
          )}
          {work && (
            <form action={setWorkStatus}>
              <input type="hidden" name="workId" value={work.id} />
              <input type="hidden" name="status" value={work.status === "suspended" ? "active" : "suspended"} />
              <input type="hidden" name="note" value={`通報 ${report.id}`} />
              <Button type="submit" variant={work.status === "suspended" ? "secondary" : "danger"}>
                {work.status === "suspended" ? "作品の公開停止を解除" : "作品を公開停止"}
              </Button>
            </form>
          )}
          {userId && profile && (
            <form action={setUserStatus}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="status" value={profile.status === "suspended" ? "active" : "suspended"} />
              <input type="hidden" name="note" value={`通報 ${report.id}`} />
              <Button type="submit" variant={profile.status === "suspended" ? "secondary" : "danger"}>
                {profile.status === "suspended" ? "アカウントの停止を解除" : "アカウントを停止"}
              </Button>
            </form>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 text-sm">
        <h2 className="text-lg font-semibold">対応の記録</h2>
        <form action={resolveReport} className="flex flex-col gap-3">
          <input type="hidden" name="reportId" value={report.id} />
          <textarea name="note" defaultValue={report.admin_note ?? ""} rows={3} maxLength={1000} placeholder="対応の内容（運営だけが見られます）" className={inputClass} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="status" value="resolved">
              対応済みにする
            </Button>
            <Button type="submit" name="status" value="dismissed" variant="secondary">
              対応なしにする
            </Button>
            <Button type="submit" name="status" value="open" variant="secondary">
              未対応に戻す
            </Button>
          </div>
        </form>
        {report.resolved_at && <p className="text-xs text-zinc-500">{dateFormat.format(new Date(report.resolved_at))} に更新</p>}
      </Card>
    </main>
  );
}
