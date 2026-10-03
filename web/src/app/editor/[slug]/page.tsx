import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/templates/queries";
import { Editor } from "./editor";

export async function generateMetadata({ params }: PageProps<"/editor/[slug]">): Promise<Metadata> {
  const template = await getTemplate((await params).slug);
  return { title: `${template?.name ?? "エディタ"} を編集 | VRC-DressDrop` };
}

export default async function EditorPage({ params }: PageProps<"/editor/[slug]">) {
  const template = await getTemplate((await params).slug);
  if (!template) notFound();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline gap-3">
        <Link href="/templates" className="text-sm text-zinc-500 hover:underline">
          ← テンプレート一覧
        </Link>
        <h1 className="text-xl font-bold">{template.name}</h1>
      </div>
      <Editor
        template={{
          name: template.name,
          tokenCost: template.tokenCost,
          previewModelUrl: template.previewModelUrl,
          slots: template.slots,
        }}
      />
    </main>
  );
}
