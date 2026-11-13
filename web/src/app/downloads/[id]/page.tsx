import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import Link from "@/i18n/link";
import { getLocale, getMessages } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PrintParams } from "@/lib/templates/params";
import { templateNameTranslator } from "@/lib/templates/queries";
import { slotLabel } from "@/lib/templates/schema";
import { DeleteSnapshotButton } from "../delete-snapshot-button";
import { RedownloadButton } from "../redownload-button";
import { parseSnapshot } from "../snapshot";
import { downloadsMessages } from "../messages";
import { gimmickMap, listGimmicks } from "@/lib/gimmicks/queries";
import { localizeGimmick, type GimmickDefinition, type GimmickParamValue } from "@/lib/gimmicks/schema";

type DetailMessages = (typeof downloadsMessages)["ja"]["detail"];

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(downloadsMessages)).detail.title} | VRPrintLab` };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function printRows(p: PrintParams, m: DetailMessages) {
  return [
    [m.rows.size, p.scaleX === p.scaleY ? pct(p.scaleX) : m.sizeXY(pct(p.scaleX), pct(p.scaleY))],
    [m.rows.offsetX, signedPct(p.offsetX)],
    [m.rows.offsetY, signedPct(p.offsetY)],
    [m.rows.rotation, `${p.rotation}°`],
    [m.rows.brightness, `${p.brightness}%`],
    [m.rows.saturation, `${p.saturation}%`],
  ];
}

function formatGimmickParam(def: GimmickDefinition | undefined, key: string, value: GimmickParamValue, m: DetailMessages) {
  const p = def?.params.find((x) => x.key === key);
  if (!p) return null;
  if (p.type === "boolean") return `${p.label}: ${value ? m.yes : m.no}`;
  if (p.type === "select") return `${p.label}: ${p.options.find((o) => o.value === value)?.label ?? value}`;
  if (p.type === "number") return `${p.label}: ${value}${p.unit}`;
  return `${p.label}: ${value}`;
}

export default async function PurchaseDetailPage({ params }: PageProps<"/downloads/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/downloads/${id}`);
  const supabase = await createClient();
  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, work_id, work_name, template_name, token_spent, created_at, package_path, thumbnail_path, snapshot, snapshot_deleted_at, suspended_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!purchase) notFound();

  const locale = await getLocale();
  const all = pick(downloadsMessages, locale);
  const m = all.detail;
  const templateName = await templateNameTranslator();
  const snapshot = parseSnapshot(purchase.snapshot);
  // ギミックの名前と設定項目は、今の定義の表示している言語のもので出す（記録の名前は購入時の日本語）
  const defs = gimmickMap((await listGimmicks()).map((d) => localizeGimmick(d, locale)));
  const paths = [...(purchase.thumbnail_path ? [purchase.thumbnail_path] : []), ...Object.values(snapshot?.images ?? {})];
  const { data: signed } = paths.length ? await supabase.storage.from("packages").createSignedUrls(paths, 60 * 60) : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const thumbnailUrl = purchase.thumbnail_path ? urlByPath.get(purchase.thumbnail_path) : undefined;

  const { data: work } = purchase.work_id
    ? await supabase.from("works").select("id, templates(slug)").eq("id", purchase.work_id).maybeSingle()
    : { data: null };
  const workSlug = (work?.templates as unknown as { slug: string } | null)?.slug;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <nav className="text-sm text-zinc-500">
        <Link href="/downloads" className="hover:underline">
          {m.back}
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">{purchase.work_name || all.noName}</h1>
          <p className="text-sm text-zinc-500">
            {m.purchased(templateName(purchase.template_name), formatDateTime(locale, purchase.created_at), purchase.token_spent)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {work && workSlug ? (
            <Link href={`/editor/${workSlug}?work=${work.id}`} className="text-sm font-semibold text-accent-dark hover:underline">
              {m.openWork}
            </Link>
          ) : (
            <span className="text-sm text-zinc-500">{m.workDeleted}</span>
          )}
          {purchase.suspended_at ? (
            <span className="text-sm text-red-700">{m.suspended}</span>
          ) : (
            purchase.package_path && <RedownloadButton purchaseId={purchase.id} />
          )}
        </div>
      </div>

      {purchase.package_path ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {m.kept}
          <DeleteSnapshotButton purchaseId={purchase.id} />
        </p>
      ) : (
        purchase.snapshot_deleted_at && (
          <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
            {m.deleted1(formatDateTime(locale, purchase.snapshot_deleted_at))}
            {m.deleted2}
          </p>
        )
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="aspect-[4/3] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={m.previewAlt(purchase.work_name)} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-sm text-zinc-400">{m.noPreview}</span>
          )}
        </div>

        {snapshot ? (
          <div className="flex flex-col gap-4">
            {snapshot.slots.map((slot) => {
              const p = snapshot.params.slots[slot.key];
              if (slot.type === "color" && p?.kind === "color") {
                return (
                  <Card key={slot.key} className="flex items-center gap-3 !p-4">
                    <span className="h-8 w-8 shrink-0 rounded-full border border-zinc-300" style={{ backgroundColor: p.color }} />
                    <div>
                      <p className="text-sm font-semibold">{slotLabel(slot, locale)}</p>
                      <p className="font-mono text-xs text-zinc-500">{p.color}</p>
                    </div>
                  </Card>
                );
              }
              if (slot.type === "print" && p?.kind === "print") {
                const imagePath = p.imageId ? snapshot.images[p.imageId] : undefined;
                const imageUrl = imagePath ? urlByPath.get(imagePath) : undefined;
                return (
                  <Card key={slot.key} className="flex flex-col gap-3 !p-4">
                    <p className="text-sm font-semibold">{slotLabel(slot, locale)}</p>
                    {p.imageId ? (
                      <div className="flex gap-4">
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-[repeating-conic-gradient(#e4e4e7_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt={m.imageAlt} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-[10px] text-zinc-400">{m.noImageRecord}</span>
                          )}
                        </div>
                        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                          {printRows(p, m).map(([label, value]) => (
                            <div key={label} className="contents">
                              <dt className="text-zinc-500">{label}</dt>
                              <dd className="tabular-nums">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">{m.noImage}</p>
                    )}
                  </Card>
                );
              }
              return null;
            })}
            <Card className="flex flex-col gap-2 !p-4">
              <p className="text-sm font-semibold">{m.gimmicks}</p>
              {snapshot.gimmicks.length === 0 ? (
                <p className="text-xs text-zinc-500">{m.none}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {snapshot.gimmicks.map((g) => {
                    const def = defs.get(g.slug);
                    const color = Object.entries(g.params).find(([k]) => def?.params.find((p) => p.key === k)?.type === "color");
                    return (
                      <li key={g.slug} className="text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          {color && <span className="h-3 w-3 rounded-full border border-zinc-300" style={{ backgroundColor: String(color[1]) }} />}
                          {def?.name ?? g.name}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {Object.entries(g.params)
                            .filter(([k]) => def?.params.find((p) => p.key === k)?.type !== "color")
                            .map(([k, v]) => formatGimmickParam(def, k, v, m))
                            .filter(Boolean)
                            .join(" / ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        ) : (
          <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
            {m.legacy}
          </p>
        )}
      </div>
    </main>
  );
}
