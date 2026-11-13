import type { Metadata } from "next";
import { buttonClassName } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import Link from "@/i18n/link";
import { getLocale, getMessages } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { templateNameTranslator } from "@/lib/templates/queries";
import { downloadsMessages } from "./messages";
import { RedownloadButton } from "./redownload-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(downloadsMessages)).title} | VRPrintLab` };
}

export default async function DownloadsPage() {
  const user = await requireUser("/downloads");
  const supabase = await createClient();
  const locale = await getLocale();
  const m = pick(downloadsMessages, locale);
  const templateName = await templateNameTranslator();
  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, work_id, work_name, template_name, token_spent, created_at, package_path, thumbnail_path, snapshot_deleted_at, suspended_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const thumbPaths = (purchases ?? []).flatMap((p) => (p.thumbnail_path ? [p.thumbnail_path] : []));
  const { data: signed } = thumbPaths.length
    ? await supabase.storage.from("packages").createSignedUrls(thumbPaths, 60 * 60)
    : { data: [] };
  const thumbByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">{m.title}</h1>
          <p className="text-sm text-zinc-500">{m.lead}</p>
        </div>
        <Link href="/works" className={buttonClassName("secondary")}>
          {m.toWorks}
        </Link>
      </div>

      {!purchases?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-zinc-50 p-10 text-center">
          <p className="text-zinc-600">{m.empty}</p>
          <Link href="/works" className="font-semibold text-accent-dark underline">
            {m.openWorks}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {purchases.map((p) => {
            const thumb = p.thumbnail_path ? thumbByPath.get(p.thumbnail_path) : undefined;
            return (
              <li key={p.id} className="flex items-center gap-4 p-4">
                <Link href={`/downloads/${p.id}`} className="block h-18 w-24 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                  {thumb ? (
                    // 署名付き URL は1時間で切れるため、最適化キャッシュを通さず直接表示する
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-[10px] text-zinc-400">{m.noImage}</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/downloads/${p.id}`} className="block truncate font-semibold text-brand hover:underline">
                    {p.work_name || m.noName}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {m.meta(templateName(p.template_name), formatDateTime(locale, p.created_at), p.token_spent)}
                    {!p.work_id && m.workDeleted}
                  </p>
                  <Link href={`/downloads/${p.id}`} className="text-xs font-medium text-accent-dark hover:underline">
                    {m.viewDetails}
                  </Link>
                </div>
                {p.suspended_at ? (
                  <span className="text-xs text-red-700">{m.suspended}</span>
                ) : p.package_path ? (
                  <RedownloadButton purchaseId={p.id} />
                ) : (
                  p.snapshot_deleted_at && <span className="text-xs text-zinc-400">{m.snapshotDeleted}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
