import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EditorHost } from "@/app/editor/[slug]/editor";
import { gimmickDefinitionSchema } from "@/lib/gimmicks/schema";

export const dynamic = "force-dynamic";

export default async function LocalCakePage() {
  if (process.env.NODE_ENV !== "development" || (await headers()).get("x-vrpl-local-preview") !== "cake") notFound();
  // Reuse the checked-in catalog; never query shared Supabase data for this page.
  const dir = path.join(process.cwd(), "gimmicks/catalog");
  const defs = await Promise.all((await readdir(dir)).filter(n => n.endsWith(".json")).map(async n =>
    gimmickDefinitionSchema.parse(JSON.parse(await readFile(path.join(dir, n), "utf8")))));
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 py-5 lg:h-[calc(100dvh-4rem-1px)] lg:min-h-[640px] lg:flex-none">
      <p className="text-xs text-zinc-500">既存エディタでローカル確認中。ケーキのプリント面配置とUnity固有の炎の動きは調整前です。</p>
      <EditorHost
        localPreview
        template={{ id: "local-cake", slug: "cake", name: "ケーキ", tokenCost: 1,
          previewModelUrl: "/local-preview/cake/assets/model.glb",
          slots: [
            { key: "cream", type: "color", label: "クリームの色", material: "Chantilly • ivory cream", defaultColor: "#fffdf2" },
            { key: "print", type: "print", label: "プリント", material: "Mat_Print", background: "transparent", aspect: 1, textureSize: 2048 },
          ],
        }}
        gimmickDefs={defs.filter(d => d.isPublic)} userId={null} initialWork={null} restoreDraft={false}
      />
    </main>
  );
}
