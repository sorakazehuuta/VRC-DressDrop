import type { Metadata } from "next";
import { RefreshOnTabReturn } from "@/components/tab-return";
import { listTemplates } from "@/lib/templates/queries";
import { parseTemplateSort } from "@/lib/templates/sort";
import { TemplateList } from "./template-list";

export const metadata: Metadata = { title: "テンプレート一覧 | VRPrintLab" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string; category?: string }> }) {
  const [templates, params] = await Promise.all([listTemplates(), searchParams]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10">
      <RefreshOnTabReturn />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">テンプレートを選ぶ</h1>
        <p className="text-zinc-600">作りたいアイテムを選ぶと、画像を貼って編集できます。</p>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-lg bg-zinc-100 p-6 text-center text-zinc-600">
          公開中のテンプレートはまだありません。
        </p>
      ) : (
        <TemplateList
          templates={templates}
          initialSort={parseTemplateSort(params.sort)}
          initialQuery={typeof params.q === "string" ? params.q : ""}
          initialCategory={typeof params.category === "string" ? params.category : ""}
        />
      )}
    </main>
  );
}
