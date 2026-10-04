import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { gimmickDefinitionSchema, type GimmickDefinition } from "./schema";

// 公開中のギミック定義。トークン数・名前・公開状態は DB の列を優先する（管理画面から変えられるように）
export const listGimmicks = cache(async (): Promise<GimmickDefinition[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gimmicks")
    .select("slug, name, description, category, token_cost, is_public, sort_order, definition")
    .eq("is_public", true)
    .order("sort_order");
  if (error) throw error;
  return data.flatMap((row) => {
    const parsed = gimmickDefinitionSchema.safeParse({
      ...(row.definition as object),
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      tokenCost: row.token_cost,
      isPublic: row.is_public,
      sortOrder: row.sort_order,
    });
    return parsed.success ? [parsed.data] : [];
  });
});

export function gimmickMap(defs: GimmickDefinition[]) {
  return new Map(defs.map((d) => [d.slug, d]));
}
