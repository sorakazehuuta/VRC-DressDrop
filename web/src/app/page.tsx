import { readContent } from "@/components/markdown";
import { FormMessage } from "@/components/ui";
import { parseNews } from "@/lib/news";
import Link from "@/i18n/link";
import { getMessages } from "@/i18n/server";
import { listTemplates } from "@/lib/templates/queries";
import { sortTemplates } from "@/lib/templates/sort";
import { homeMessages } from "./home-messages";
import { HomeUpload } from "./home-upload";

// トップページで画像を選んだときに開くテンプレート（背景が透明な絵なら、絵の形のアクリルになる）
const TRY_TEMPLATE = "acrylic-stand";

// 試す欄からグッズの写真へ向かう矢印（スマホ幅では下向き）
function RainbowArrow() {
  return (
    <svg viewBox="0 0 64 40" aria-hidden="true" className="mx-auto h-10 w-16 rotate-90 md:h-14 md:w-24 md:rotate-0">
      <defs>
        <linearGradient id="home-arrow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="0.35" stopColor="#86efac" />
          <stop offset="0.65" stopColor="#fde047" />
          <stop offset="1" stopColor="#f9a8d4" />
        </linearGradient>
      </defs>
      <path d="M2 14h36V3l24 17-24 17V26H2z" fill="url(#home-arrow)" />
    </svg>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  const m = await getMessages(homeMessages);
  const news = parseNews(await readContent("news.md")).slice(0, 3);
  // 「画像を1枚アップして試す」で開くテンプレート。公開していなければ、おすすめ順の先頭
  const templates = await listTemplates();
  const trySlug = templates.some((t) => t.slug === TRY_TEMPLATE) ? TRY_TEMPLATE : (sortTemplates(templates, "recommended")[0]?.slug ?? TRY_TEMPLATE);

  return (
    <main className="flex flex-1 flex-col">
      {deleted === "1" && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-6">
          <FormMessage state={{ message: m.deleted }} />
        </div>
      )}

      {/* 見出しと、画像を1枚選んで試す欄 → 同じ画像を貼ったグッズの写真（Unity で撮ったもの） */}
      <section className="hero-grid border-b border-zinc-200">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-10 pb-12 md:gap-10 md:pt-14 md:pb-16">
          <h1 className="text-center text-[1.75rem] font-extrabold leading-[1.3] tracking-tight text-balance text-brand [word-break:auto-phrase] sm:text-[2.25rem] lg:text-[2.6rem]">
            {m.headline.map((phrase) => (
              <span key={phrase} className="inline-block">
                {phrase}
              </span>
            ))}
          </h1>
          <div className="grid items-center gap-6 md:grid-cols-[minmax(0,5fr)_auto_minmax(0,7fr)] md:gap-5">
            <HomeUpload templateSlug={trySlug} />
            <RainbowArrow />
            <figure className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/home/goods.webp"
                srcSet="/home/goods-820.webp 820w, /home/goods.webp 1640w"
                sizes="(min-width: 1152px) 640px, (min-width: 768px) 55vw, 100vw"
                width={1640}
                height={680}
                alt={m.goodsAlt}
                className="w-full rounded-2xl bg-zinc-100 ring-1 ring-zinc-200"
              />
              <figcaption className="text-right text-sm">
                <Link href="/templates" className="font-semibold text-accent-dark underline underline-offset-4 hover:text-brand">
                  {m.allTemplates(templates.length)}
                </Link>
              </figcaption>
            </figure>
          </div>
        </div>
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
