import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { updateGimmicks, updateTemplates } from "../actions";
import { CatalogForm } from "./form";

export default async function AdminCatalogPage() {
  const admin = createAdminClient();
  const [{ data: templates }, { data: gimmicks }] = await Promise.all([
    admin.from("templates").select("id, slug, name, name_reading, token_cost, is_public").order("sort_order"),
    admin.from("gimmicks").select("id, slug, name, token_cost, is_public").order("sort_order"),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600">
        トークン数・公開状態・並び順（テンプレートは名前の読みも）はここで変えます。同期コマンド（templates:sync / gimmicks:sync）は、登録済みのものの値を上書きしません（ファイルの値は初回の登録だけに使い、新しく登録したものは最後に並びます）。読みはテンプレート一覧の「名前順」に使います。
        モデル・スロット・ギミックの中身の登録と更新は、これまでどおりファイルと同期コマンドで行います。非公開のテンプレートは、管理者だけがエディタで確認できます。
      </p>
      <Card className="flex flex-col">
        <h1 className="mb-2 text-lg font-semibold">テンプレート</h1>
        <CatalogForm rows={templates ?? []} action={updateTemplates} previewBase="/editor" saveLabel="テンプレートを保存" orderNote="この順番がテンプレート一覧の「おすすめ順」（最初に表示される順）になります。" />
      </Card>
      <Card className="flex flex-col">
        <h2 className="mb-2 text-lg font-semibold">ギミック</h2>
        <CatalogForm rows={gimmicks ?? []} action={updateGimmicks} saveLabel="ギミックを保存" orderNote="この順番がエディタでの並び順になります（分類の見出しは、その分類で一番上のものの位置に出ます）。" />
      </Card>
    </main>
  );
}
