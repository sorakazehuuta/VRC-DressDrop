import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PrintParams } from "@/lib/templates/params";
import { RedownloadButton } from "../redownload-button";
import { parseSnapshot } from "../snapshot";

export const metadata: Metadata = { title: "購入した版の内容 | VRPrintLab" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tokyo" });
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function printRows(p: PrintParams) {
  return [
    ["サイズ", p.keepAspect || p.scaleX === p.scaleY ? pct(p.scaleX) : `横 ${pct(p.scaleX)} / 縦 ${pct(p.scaleY)}`],
    ["位置（左右）", signedPct(p.offsetX)],
    ["位置（上下）", signedPct(p.offsetY)],
    ["回転", `${p.rotation}°`],
    ["明るさ", `${p.brightness}%`],
    ["彩度", `${p.saturation}%`],
  ];
}

export default async function PurchaseDetailPage({ params }: PageProps<"/downloads/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/downloads/${id}`);
  const supabase = await createClient();
  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, work_id, work_name, template_name, token_spent, created_at, package_path, thumbnail_path, snapshot")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!purchase) notFound();

  const snapshot = parseSnapshot(purchase.snapshot);
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
          ← ダウンロード履歴
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">{purchase.work_name || "（名前なし）"}</h1>
          <p className="text-sm text-zinc-500">
            {purchase.template_name}・{dateFormat.format(new Date(purchase.created_at))} に購入・{purchase.token_spent} トークン
          </p>
        </div>
        <div className="flex items-center gap-3">
          {work && workSlug ? (
            <Link href={`/editor/${workSlug}?work=${work.id}`} className="text-sm font-semibold text-accent-dark hover:underline">
              現在の作品を開く
            </Link>
          ) : (
            <span className="text-sm text-zinc-500">作品は削除済みです</span>
          )}
          {purchase.package_path && <RedownloadButton purchaseId={purchase.id} />}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="aspect-[4/3] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={`${purchase.work_name} のプレビュー`} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-sm text-zinc-400">プレビュー画像の記録はありません</span>
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
                      <p className="text-sm font-semibold">{slot.label}</p>
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
                    <p className="text-sm font-semibold">{slot.label}</p>
                    {p.imageId ? (
                      <div className="flex gap-4">
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-[repeating-conic-gradient(#e4e4e7_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="使用した画像" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-[10px] text-zinc-400">画像の記録なし</span>
                          )}
                        </div>
                        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                          {printRows(p).map(([label, value]) => (
                            <div key={label} className="contents">
                              <dt className="text-zinc-500">{label}</dt>
                              <dd className="tabular-nums">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">画像なし</p>
                    )}
                  </Card>
                );
              }
              return null;
            })}
          </div>
        ) : (
          <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
            この版は、編集内容を記録する機能を追加する前に購入されたため、詳しい内容を表示できません。ダウンロードは引き続き可能です。
          </p>
        )}
      </div>
    </main>
  );
}
