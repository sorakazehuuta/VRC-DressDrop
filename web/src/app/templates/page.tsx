import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listTemplates } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "テンプレート一覧 | VRPrintLab" };

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">テンプレートを選ぶ</h1>
        <p className="text-zinc-600">作りたいアイテムを選ぶと、画像を貼って編集できます。</p>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-lg bg-zinc-100 p-6 text-center text-zinc-600">
          公開中のテンプレートはまだありません。
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/editor/${t.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-md"
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-zinc-100">
                  {t.thumbnailUrl ? (
                    <Image src={t.thumbnailUrl} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" unoptimized />
                  ) : (
                    <span className="text-5xl font-bold text-zinc-300">{t.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <span className="text-xs text-zinc-500">{t.category}</span>
                  <span className="font-semibold group-hover:underline">{t.name}</span>
                  {t.description && <p className="text-sm text-zinc-600">{t.description}</p>}
                  <span className="mt-auto pt-2 text-sm">
                    <strong>{t.tokenCost}</strong> トークン
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
