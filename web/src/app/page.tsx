import Image from "next/image";
import { readContent } from "@/components/markdown";
import { FormMessage } from "@/components/ui";
import { parseNews } from "@/lib/news";
import Link from "@/i18n/link";
import { getMessages } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/templates/queries";
import { sortTemplates } from "@/lib/templates/sort";
import { homeMessages } from "./home-messages";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  const m = await getMessages(homeMessages);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const news = parseNews(await readContent("news.md")).slice(0, 3);
  // トップに並べるグッズ: おすすめ順の先頭から、サムネイルのあるもの 6 つ
  const templates = await listTemplates();
  const showcase = sortTemplates(templates, "recommended")
    .filter((t) => t.thumbnailUrl)
    .slice(0, 6);

  return (
    <main className="flex flex-1 flex-col">
      {deleted === "1" && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-6">
          <FormMessage state={{ message: m.deleted }} />
        </div>
      )}

      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-16 md:grid-cols-2 md:gap-16 md:pt-20 md:pb-24">
        <div className="flex flex-col gap-6">
          <h1 className="text-[2rem] font-extrabold leading-[1.25] tracking-tight text-balance text-brand [word-break:auto-phrase] sm:text-[2.5rem]">
            {m.headline1}
            <br />
            {m.headline2}
          </h1>
          <p className="max-w-[34em] text-lg leading-relaxed text-zinc-600">{m.lead}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/templates" className="rounded-lg bg-accent px-6 py-3.5 text-base font-bold text-white hover:bg-accent-dark">
              {m.start}
            </Link>
            {loggedIn ? (
              <Link href="/works" className="rounded-lg border border-brand px-5 py-3.5 font-semibold text-brand hover:bg-zinc-50">
                {m.myWorks}
              </Link>
            ) : (
              <Link href="/signup" className="rounded-lg border border-brand px-5 py-3.5 font-semibold text-brand hover:bg-zinc-50">
                {m.signup}
              </Link>
            )}
          </div>
        </div>

        {showcase.length > 0 && (
          // 実際に作れるグッズを、印刷の台紙に並べたように見せる（四隅にトンボ）
          <figure className="mx-2 flex flex-col gap-4 sm:mx-4">
            <ul aria-label={m.showcase} className="trim-marks grid grid-cols-3 gap-px bg-zinc-200 ring-1 ring-zinc-200">
              {showcase.map((t) => (
                <li key={t.slug}>
                  <Link href={`/editor/${t.slug}`} className="group flex h-full flex-col bg-zinc-100">
                    <span className="relative block aspect-square overflow-hidden">
                      <Image src={t.thumbnailUrl!} alt="" fill sizes="(min-width: 768px) 200px, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-105" unoptimized priority />
                    </span>
                    <span className="flex flex-col bg-white px-2.5 py-2 text-xs leading-snug sm:text-sm">
                      <span className="font-semibold text-zinc-900 group-hover:underline">{t.name}</span>
                      <span className="text-zinc-500 tabular-nums">
                        {t.tokenCost} {m.tokenUnit(t.tokenCost)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <figcaption className="text-sm">
              <Link href="/templates" className="font-semibold text-accent-dark underline underline-offset-4 hover:text-brand">
                {m.allTemplates(templates.length)}
              </Link>
            </figcaption>
          </figure>
        )}
      </section>

      <section aria-labelledby="steps-heading" className="bg-zinc-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14">
          <h2 id="steps-heading" className="text-xl font-bold text-brand">
            {m.stepsHeading}
          </h2>
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {m.steps.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2 border-t-2 border-brand pt-4">
                <h3 className="flex items-baseline gap-3 text-lg font-bold text-brand">
                  <span className="text-3xl font-extrabold leading-none text-accent-dark tabular-nums">{i + 1}</span>
                  {step.title}
                </h3>
                <p className="leading-relaxed text-zinc-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {news.length > 0 && (
        <section>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-bold text-brand">{m.news}</h2>
              <Link href="/news" className="text-sm text-zinc-600 underline">
                {m.allNews}
              </Link>
            </div>
            <ul className="flex flex-col divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
              {news.map((item) => (
                <li key={`${item.date}-${item.title}`} className="flex flex-col gap-x-6 py-3 sm:flex-row">
                  <time dateTime={item.date} className="shrink-0 tabular-nums text-zinc-500">
                    {item.date.replaceAll("-", "/")}
                  </time>
                  <Link href="/news" className="hover:underline">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
