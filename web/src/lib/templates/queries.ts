import "server-only";
import { cache } from "react";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "./categories";
import { slotsSchema, type Slot } from "./schema";

// name・description・categoryLabel は表示している言語のもの。category は絞り込みに使う日本語の値（DB の値）
export type TemplateSummary = {
  slug: string;
  name: string;
  category: string;
  categoryLabel: string;
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

// 英語版の名前・説明（name_en / description_en。空なら日本語）
export function localizedTemplateText(row: { name: string; description?: string; name_en?: string; description_en?: string }, locale: Locale) {
  const en = locale === "en";
  return {
    name: en && row.name_en ? row.name_en : row.name,
    description: en && row.name_en ? (row.description_en ?? "") : (row.description ?? ""),
  };
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  const supabase = await createClient();
  const locale = await getLocale();
  // 英語の列（name_en など）を足す前の DB でも動くよう、列を名指しせずに読む
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    // RLS では管理者に非公開のものも見えるため、ここでも公開中に絞る
    .eq("is_public", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data.map((t) => ({
    slug: t.slug,
    ...localizedTemplateText(t, locale),
    category: t.category,
    categoryLabel: categoryLabel(t.category, locale),
    tokenCost: t.token_cost,
    thumbnailUrl: t.thumbnail_path ? templateAssetUrl(t.thumbnail_path) : null,
    // 英語版の名前順は英語の名前で並べる
    nameReading: locale === "en" ? "" : t.name_reading,
    createdAt: t.created_at,
  }));
}

export const getTemplate = cache(async (slug: string): Promise<TemplateDetail | null> => {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("slug", slug)
    // 非公開のものは RLS で管理者だけが開ける（公開前の確認用）
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    ...localizedTemplateText(data, locale),
    category: data.category,
    categoryLabel: categoryLabel(data.category, locale),
    tokenCost: data.token_cost,
    thumbnailUrl: data.thumbnail_path ? templateAssetUrl(data.thumbnail_path) : null,
    previewModelUrl: templateAssetUrl(data.preview_model_path),
    slots: slotsSchema.parse(data.slots),
  };
});
