"use client";

import Image from "next/image";
import { useState } from "react";
import { useMessages } from "@/i18n/client";
import Link from "@/i18n/link";
import { categoryId, categoryOptions, filterByCategory } from "@/lib/templates/categories";
import type { TemplateListItem } from "@/lib/templates/queries";
import { filterTemplates, sortTemplates, templateSorts, type TemplateSort } from "@/lib/templates/sort";
import { templatesMessages } from "./messages";

type ListState = { sort: TemplateSort; query: string; category: string };

// 並び順・検索語・カテゴリは URL に残す（戻る・再読み込み・言語の切り替えで同じ並びに戻れるように）。
// カテゴリは言語に依存しない ID（signs など）で残す
function replaceQuery({ sort, query, category }: ListState) {
  const params = new URLSearchParams(window.location.search);
  if (sort === "recommended") params.delete("sort");
  else params.set("sort", sort);
  if (query.trim()) params.set("q", query.trim());
  else params.delete("q");
  if (category) params.set("category", categoryId(category));
  else params.delete("category");
  const search = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
}

export function TemplateList({
  templates,
  initialSort,
  initialQuery,
  initialCategory,
}: {
  templates: TemplateListItem[];
  initialSort: TemplateSort;
  initialQuery: string;
  initialCategory: string;
}) {
  const m = useMessages(templatesMessages);
  const categories = categoryOptions(templates);
  const labels = new Map(templates.map((t) => [t.category, t.categoryLabel]));
  const [state, setState] = useState<ListState>({
    sort: initialSort,
    query: initialQuery,
    // URL のカテゴリ（ID。以前の日本語の名前も受け付ける）が一覧にない（公開中のテンプレートがない）ときは「すべて」にする
    category: categories.find((c) => categoryId(c.name) === initialCategory || c.name === initialCategory)?.name ?? "",
  });
  const { sort, query, category } = state;
  const update = (patch: Partial<ListState>) => {
    const next = { ...state, ...patch };
    setState(next);
    replaceQuery(next);
  };

  // カテゴリのボタンの件数は、名前での検索に合うものの数
  const matched = filterTemplates(templates, query);
  const counts = new Map(categoryOptions(matched).map((c) => [c.name, c.count]));
  const shown = sortTemplates(filterByCategory(matched, category), sort);
  const filtered = Boolean(category || query.trim());
  const summary = filtered ? m.summary(category ? (labels.get(category) ?? category) : "", query.trim(), shown.length) : m.total(templates.length);

  return (
    <div className="flex flex-col gap-4">
      {categories.length > 1 && (
        <div role="group" aria-label={m.categoryGroup} className="flex flex-wrap gap-2">
          {[{ name: "", label: m.all, count: matched.length }, ...categories.map((c) => ({ name: c.name, label: labels.get(c.name) ?? c.name, count: counts.get(c.name) ?? 0 }))].map((c) => {
            const selected = category === c.name;
            return (
              <button
                key={c.name || "all"}
                type="button"
                aria-pressed={selected}
                onClick={() => update({ category: c.name })}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  selected ? "border-brand bg-brand font-semibold text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                {c.label}
                <span className={`ml-1.5 text-xs ${selected ? "text-white/80" : "text-zinc-400"}`}>{c.count}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder={m.searchPlaceholder}
          aria-label={m.searchLabel}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm sm:w-80"
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-600">
          {m.sortLabel}
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value as TemplateSort })}
            className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
          >
            {templateSorts.map((value) => (
              <option key={value} value={value}>
                {m.sorts[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-zinc-500" aria-live="polite">
        {summary}
      </p>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-zinc-100 p-6 text-center text-zinc-600">
          <p>{category ? m.notFoundInCategory : m.notFound}</p>
          <button type="button" onClick={() => update({ query: "", category: "" })} className="cursor-pointer text-sm font-semibold text-zinc-900 underline">
            {m.reset}
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((t) => (
            <li key={t.slug} data-template={t.slug}>
              <Link
                href={`/editor/${t.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-md"
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-zinc-100">
                  {t.thumbnailUrl ? (
                    <Image src={t.thumbnailUrl} alt="" fill sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" unoptimized />
                  ) : (
                    <span className="text-5xl font-bold text-zinc-300">{t.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <span className="text-xs text-zinc-500">{t.categoryLabel}</span>
                  <span className="font-semibold group-hover:underline">{t.name}</span>
                  {t.description && <p className="text-sm text-zinc-600">{t.description}</p>}
                  <span className="mt-auto pt-2 text-sm">
                    <strong>{t.tokenCost}</strong> {m.tokenUnit(t.tokenCost)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
