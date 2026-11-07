import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { updateGimmicks, updateTemplates } from "../actions";
import { CatalogForm } from "./form";

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
        <CatalogForm rows={templates ?? []} action={updateTemplates} previewBase="/editor" saveLabel="テンプレートを保存" />
      </Card>
      <Card className="flex flex-col">
        <h2 className="mb-2 text-lg font-semibold">ギミック</h2>
        <CatalogForm rows={gimmicks ?? []} action={updateGimmicks} saveLabel="ギミックを保存" />
      </Card>
    </main>
  );
}
