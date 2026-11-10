import "server-only";
import { cache } from "react";
import { supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { slotsSchema, type Slot } from "./schema";

export type TemplateSummary = {
  slug: string;
  name: string;
  category: string;
  description: string;
  tokenCost: number;
  thumbnailUrl: string | null;
};

// 一覧で並べ替え・絞り込みに使う項目つき
export type TemplateListItem = TemplateSummary & { nameReading: string; createdAt: string };

export type TemplateDetail = TemplateSummary & { id: string; previewModelUrl: string; slots: Slot[] };

export function templateAssetUrl(path: string) {
  return `${supabaseUrl}/storage/v1/object/public/template-assets/${path}`;
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("slug, name, name_reading, category, description, token_cost, thumbnail_path, created_at")
    // RLS では管理者に非公開のものも見えるため、ここでも公開中に絞る
    .eq("is_public", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data.map((t) => ({
    slug: t.slug,
    name: t.name,
    category: t.category,
    description: t.description,
    tokenCost: t.token_cost,
    thumbnailUrl: t.thumbnail_path ? templateAssetUrl(t.thumbnail_path) : null,
    nameReading: t.name_reading,
    createdAt: t.created_at,
  }));
}

export const getTemplate = cache(async (slug: string): Promise<TemplateDetail | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, slug, name, category, description, token_cost, thumbnail_path, preview_model_path, slots")
    .eq("slug", slug)
    // 非公開のものは RLS で管理者だけが開ける（公開前の確認用）
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    category: data.category,
    description: data.description,
    tokenCost: data.token_cost,
    thumbnailUrl: data.thumbnail_path ? templateAssetUrl(data.thumbnail_path) : null,
    previewModelUrl: templateAssetUrl(data.preview_model_path),
    slots: slotsSchema.parse(data.slots),
  };
});
