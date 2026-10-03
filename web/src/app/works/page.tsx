import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_WORKS_PER_USER, WORK_IMAGES_BUCKET } from "@/lib/works/constants";
import { WorkCard, type WorkCardData } from "./work-card";

export const metadata: Metadata = { title: "マイ作品 | VRPrintLab" };

export default async function WorksPage() {
  const user = await requireUser("/works");
  const supabase = await createClient();

  const { data: works } = await supabase
    .from("works")
    .select("id, name, status, updated_at, thumbnail_path, templates(slug, name)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const thumbPaths = (works ?? []).flatMap((w) => (w.thumbnail_path ? [w.thumbnail_path] : []));
  const { data: signed } = thumbPaths.length
    ? await supabase.storage.from(WORK_IMAGES_BUCKET).createSignedUrls(thumbPaths, 60 * 60)
    : { data: [] };
  const thumbByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const cards: WorkCardData[] = (works ?? []).map((w) => {
    const template = w.templates as unknown as { slug: string; name: string } | null;
    return {
      id: w.id,
      name: w.name,
      suspended: w.status === "suspended",
      updatedAt: w.updated_at,
      templateName: template?.name ?? "",
      editUrl: `/editor/${template?.slug}?work=${w.id}`,
      thumbnailUrl: w.thumbnail_path ? (thumbByPath.get(w.thumbnail_path) ?? null) : null,
    };
  });
  const full = cards.length >= MAX_WORKS_PER_USER;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">マイ作品</h1>
          <p className="text-sm text-zinc-500">
            {cards.length} / {MAX_WORKS_PER_USER} 件
            {full && "（上限に達しています。新しく保存するには不要な作品を削除してください）"}
          </p>
        </div>
        <Link href="/templates" className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">
          新しく作る
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-zinc-50 p-10 text-center">
          <p className="text-zinc-600">まだ保存した作品はありません。</p>
          <Link href="/templates" className="font-semibold text-accent-dark underline">
            テンプレートを選んで作ってみる
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((work) => (
            <li key={work.id}>
              <WorkCard work={work} canDuplicate={!full} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
