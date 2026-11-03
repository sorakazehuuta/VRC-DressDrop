import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { updateGimmick, updateTemplate } from "../actions";

type Row = { id: string; slug: string; name: string; token_cost: number; is_public: boolean };

function RowForm({ row, action, previewHref }: { row: Row; action: (formData: FormData) => Promise<void>; previewHref?: string }) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 border-t border-zinc-100 py-2 text-sm">
      <input type="hidden" name="id" value={row.id} />
      <span className="min-w-40 flex-1">
        {row.name} <span className="font-mono text-xs text-zinc-400">{row.slug}</span>
        {previewHref && (
          <Link href={previewHref} className="ml-2 text-xs underline">
            エディタで確認
          </Link>
        )}
      </span>
      <label className="flex items-center gap-1">
        <input name="tokenCost" type="number" min={0} max={100} step={1} defaultValue={row.token_cost} className="w-16 rounded border border-zinc-300 px-2 py-1 text-right" />
        トークン
      </label>
      <label className="flex items-center gap-1">
        <input name="isPublic" type="checkbox" defaultChecked={row.is_public} />
        公開
      </label>
      <Button type="submit" variant="secondary" className="!py-1">
        保存
      </Button>
    </form>
  );
}

export default async function AdminCatalogPage() {
  const admin = createAdminClient();
  const [{ data: templates }, { data: gimmicks }] = await Promise.all([
    admin.from("templates").select("id, slug, name, token_cost, is_public").order("sort_order"),
    admin.from("gimmicks").select("id, slug, name, token_cost, is_public").order("sort_order"),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600">
        トークン数と公開状態はここで変えます。同期コマンド（templates:sync / gimmicks:sync）は、登録済みのもののトークン数・公開状態を上書きしません（ファイルの値は初回の登録だけに使います）。
        モデル・スロット・ギミックの中身の登録と更新は、これまでどおりファイルと同期コマンドで行います。非公開のテンプレートは、管理者だけがエディタで確認できます。
      </p>
      <Card className="flex flex-col">
        <h1 className="mb-2 text-lg font-semibold">テンプレート</h1>
        {(templates ?? []).map((t) => (
          <RowForm key={t.id} row={t} action={updateTemplate} previewHref={`/editor/${t.slug}`} />
        ))}
      </Card>
      <Card className="flex flex-col">
        <h2 className="mb-2 text-lg font-semibold">ギミック</h2>
        {(gimmicks ?? []).map((g) => (
          <RowForm key={g.id} row={g} action={updateGimmick} />
        ))}
      </Card>
    </main>
  );
}
