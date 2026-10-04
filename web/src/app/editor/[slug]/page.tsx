import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseEditorParams } from "@/lib/templates/params";
import { getTemplate } from "@/lib/templates/queries";
import { gimmickMap, listGimmicks } from "@/lib/gimmicks/queries";
import { parseGimmickSelection } from "@/lib/gimmicks/schema";
import { WORK_IMAGES_BUCKET } from "@/lib/works/constants";
import { EditorHost, type InitialWork } from "./editor";

export async function generateMetadata({ params }: PageProps<"/editor/[slug]">): Promise<Metadata> {
  const template = await getTemplate((await params).slug);
  return { title: `${template?.name ?? "エディタ"} を編集 | VRPrintLab` };
}

export default async function EditorPage({ params, searchParams }: PageProps<"/editor/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const template = await getTemplate(slug);
  if (!template) notFound();

  const user = await getCurrentUser();
  const gimmickDefs = await listGimmicks();
  const workId = typeof query.work === "string" ? query.work : null;
  let initialWork: InitialWork | null = null;

  if (workId) {
    if (!user) redirect(`/login?next=${encodeURIComponent(`/editor/${slug}?work=${workId}`)}`);
    const supabase = await createClient();
    const { data: work } = await supabase
      .from("works")
      .select("id, name, params, gimmicks, status, updated_at, templates(slug), work_images(id, slot, storage_path)")
      .eq("id", workId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!work) notFound();
    const workTemplate = work.templates as unknown as { slug: string } | null;
    if (workTemplate && workTemplate.slug !== slug) redirect(`/editor/${workTemplate.slug}?work=${workId}`);

    const paths = work.work_images.map((i) => i.storage_path);
    const { data: signed } = paths.length
      ? await supabase.storage.from(WORK_IMAGES_BUCKET).createSignedUrls(paths, 60 * 60)
      : { data: [] };
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

    initialWork = {
      id: work.id,
      name: work.name,
      params: parseEditorParams(work.params, template.slots),
      gimmicks: parseGimmickSelection(work.gimmicks, gimmickMap(gimmickDefs)),
      images: work.work_images.flatMap((i) => {
        const url = urlByPath.get(i.storage_path);
        return url ? [{ id: i.id, slot: i.slot, url, ext: i.storage_path.endsWith(".png") ? ("png" as const) : ("jpg" as const) }] : [];
      }),
      suspended: work.status === "suspended",
      updatedAt: work.updated_at,
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 py-5">
      <nav className="flex gap-3 text-sm text-zinc-500">
        <Link href="/templates" className="hover:underline">
          ← テンプレート一覧
        </Link>
        {user && (
          <Link href="/works" className="hover:underline">
            マイ作品
          </Link>
        )}
      </nav>
      <EditorHost
        template={{
          id: template.id,
          slug: template.slug,
          name: template.name,
          tokenCost: template.tokenCost,
          previewModelUrl: template.previewModelUrl,
          slots: template.slots,
        }}
        gimmickDefs={gimmickDefs}
        userId={user?.id ?? null}
        initialWork={initialWork}
        restoreDraft={query.draft === "1" && !initialWork}
      />
    </main>
  );
}
