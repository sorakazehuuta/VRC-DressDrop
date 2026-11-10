"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { TemplateListItem } from "@/lib/templates/queries";
import { filterTemplates, sortTemplates, templateSorts, type TemplateSort } from "@/lib/templates/sort";

// 並び順と検索語は URL に残す（戻る・再読み込みで同じ並びに戻れるように）
function replaceQuery(sort: TemplateSort, query: string) {
  const params = new URLSearchParams(window.location.search);
  if (sort === "recommended") params.delete("sort");
  else params.set("sort", sort);
  if (query.trim()) params.set("q", query.trim());
  else params.delete("q");
  const search = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
}

export function TemplateList({ templates, initialSort, initialQuery }: { templates: TemplateListItem[]; initialSort: TemplateSort; initialQuery: string }) {
  const [sort, setSort] = useState(initialSort);
  const [query, setQuery] = useState(initialQuery);
  const shown = sortTemplates(filterTemplates(templates, query), sort);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            replaceQuery(sort, e.target.value);
          }}
          placeholder="名前で探す（例: 看板）"
          aria-label="テンプレートを名前で探す"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-600">
          並び順
          <select
            value={sort}
            onChange={(e) => {
              const next = e.target.value as TemplateSort;
              setSort(next);
              replaceQuery(next, query);
            }}
            className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
          >
            {Object.entries(templateSorts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-zinc-500" aria-live="polite">
        {query.trim() ? `「${query.trim()}」に合うテンプレート ${shown.length} 件` : `${templates.length} 件のテンプレート`}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-lg bg-zinc-100 p-6 text-center text-zinc-600">
          見つかりませんでした。別のことばで探してみてください。
        </p>
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
                  <span className="text-xs text-zinc-500">{t.category}</span>
                  <span className="font-semibold group-hover:underline">{t.name}</span>
                  {t.description && <p className="text-sm text-zinc-600">{t.description}</p>}
                  <span className="mt-auto pt-2 text-sm">
                    <strong>{t.tokenCost}</strong> トークン
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
