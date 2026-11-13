import type { Metadata } from "next";
import { buttonClassName } from "@/components/ui";
import Link from "@/i18n/link";
import { getLocale, getMessages } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localizedTemplateText } from "@/lib/templates/queries";
import { MAX_WORKS_PER_USER, WORK_IMAGES_BUCKET } from "@/lib/works/constants";
import { worksMessages } from "./messages";
import { WorkCard, type WorkCardData } from "./work-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(worksMessages)).title} | VRPrintLab` };
}

export default async function WorksPage() {
  const user = await requireUser("/works");
  const supabase = await createClient();
  const locale = await getLocale();
  const m = pick(worksMessages, locale);

  const { data: works } = await supabase
    .from("works")
    .select("id, name, status, updated_at, thumbnail_path, templates(*)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const thumbPaths = (works ?? []).flatMap((w) => (w.thumbnail_path ? [w.thumbnail_path] : []));
  const { data: signed } = thumbPaths.length
    ? await supabase.storage.from(WORK_IMAGES_BUCKET).createSignedUrls(thumbPaths, 60 * 60)
    : { data: [] };
  const thumbByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const cards: WorkCardData[] = (works ?? []).map((w) => {
    const template = w.templates as unknown as { slug: string; name: string; name_en?: string } | null;
    return {
      id: w.id,
      name: w.name,
      suspended: w.status === "suspended",
      updatedAt: w.updated_at,
      templateName: template ? localizedTemplateText(template, locale).name : "",
      editUrl: `/editor/${template?.slug}?work=${w.id}`,
      thumbnailUrl: w.thumbnail_path ? (thumbByPath.get(w.thumbnail_path) ?? null) : null,
    };
  });
  const full = cards.length >= MAX_WORKS_PER_USER;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 pt-10 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-extrabold text-brand">{m.title}</h1>
          <p className="text-sm text-zinc-500">
            {m.count(cards.length, MAX_WORKS_PER_USER)}
            {full && m.full}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/downloads" className={buttonClassName("secondary")}>
            {m.downloads}
          </Link>
          <Link href="/templates" className={buttonClassName("accent")}>
            {m.create}
          </Link>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-zinc-100 p-10 text-center">
          <p className="text-zinc-600">{m.empty}</p>
          <Link href="/templates" className="font-semibold text-accent-dark underline">
            {m.emptyCta}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
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
