import { defineMessages } from "@/i18n/messages";

export const templatesMessages = defineMessages({
  ja: {
    title: "テンプレート一覧",
    heading: "テンプレートを選ぶ",
    lead: "作りたいアイテムを選ぶと、画像を貼って編集できます。",
    empty: "公開中のテンプレートはまだありません。",
    categoryGroup: "カテゴリで絞り込む",
    all: "すべて",
    searchPlaceholder: "名前で探す（例: 看板）",
    searchLabel: "テンプレートを名前で探す",
    sortLabel: "並び順",
    sorts: { recommended: "おすすめ順", newest: "新しい順", "cost-asc": "トークンが少ない順", "cost-desc": "トークンが多い順", name: "名前順（あいうえお）" },
    total: (n: number) => `${n} 件のテンプレート`,
    // 「看板」で、「木」に合うテンプレート 2 件 / 「看板」のテンプレート 6 件 / 「木」に合うテンプレート 2 件
    summary: (category: string, query: string, n: number) =>
      `${category ? `「${category}」` : ""}${category && query ? "で、" : ""}${query ? `「${query}」に合う` : "の"}テンプレート ${n} 件`,
    notFoundInCategory: "このカテゴリには、検索に合うテンプレートがありません。",
    notFound: "見つかりませんでした。別のことばで探してみてください。",
    reset: "絞り込みと検索を解除する",
    // 英語は数で単数・複数が変わるため、数を受け取る形にそろえる
    tokenUnit: (() => "トークン") as (n: number) => string,
  },
  en: {
    title: "Templates",
    heading: "Choose a template",
    lead: "Choose an item to make, then add your images and edit it.",
    empty: "No templates are available yet.",
    categoryGroup: "Filter by category",
    all: "All",
    searchPlaceholder: "Search by name (e.g. sign)",
    searchLabel: "Search templates by name",
    sortLabel: "Sort by",
    sorts: { recommended: "Recommended", newest: "Newest", "cost-asc": "Fewest tokens", "cost-desc": "Most tokens", name: "Name (A–Z)" },
    total: (n: number) => `${n} ${n === 1 ? "template" : "templates"}`,
    summary: (category: string, query: string, n: number) =>
      `${n} ${n === 1 ? "template" : "templates"}${category ? ` in "${category}"` : ""}${query ? ` matching "${query}"` : ""}`,
    notFoundInCategory: "No templates in this category match your search.",
    notFound: "No results found. Try a different word.",
    reset: "Clear filters and search",
    tokenUnit: (n: number) => (n === 1 ? "token" : "tokens"),
  },
});
