// テンプレートのカテゴリ（template.json の category と DB の値は日本語の名前）。一覧の絞り込みはこの順番で並べる
// 新しいカテゴリを使うときはここに足す（ここにないカテゴリも一覧には出るが、並びは最後になる）。英語の名前も必ず書く
// id は URL（?category=）に使う。言語を切り替えても同じ絞り込みのままにするため、言語に依存しない英字にする
const CATEGORY_INFO = [
  { name: "グッズ", id: "goods", en: "Merch" },
  { name: "パネル・ディスプレイ", id: "panels", en: "Panels & Displays" },
  { name: "看板", id: "signs", en: "Signs" },
  { name: "カフェ・バー用品", id: "cafe-bar", en: "Café & Bar" },
  { name: "フード・ドリンク", id: "food", en: "Food & Drinks" },
] as const;

export const TEMPLATE_CATEGORIES = CATEGORY_INFO.map((c) => c.name);

// 表示名（英語版では英語の名前。決めていないカテゴリはそのまま）
export function categoryLabel(name: string, locale: "ja" | "en") {
  return locale === "en" ? (CATEGORY_INFO.find((c) => c.name === name)?.en ?? name) : name;
}

// URL に使う ID（決めていないカテゴリは名前のまま）
export const categoryId = (name: string) => CATEGORY_INFO.find((c) => c.name === name)?.id ?? name;

export type CategoryOption = { name: string; count: number };

// 絞り込みの選択肢と件数。テンプレートがないカテゴリは出さない
export function categoryOptions(templates: { category: string }[]): CategoryOption[] {
  const counts = new Map<string, number>();
  for (const t of templates) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  const known: readonly string[] = TEMPLATE_CATEGORIES;
  const order = (name: string) => (known.includes(name) ? known.indexOf(name) : known.length);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name, "ja"));
}

// カテゴリで絞る（空ならすべて）
export function filterByCategory<T extends { category: string }>(templates: T[], category: string): T[] {
  return category ? templates.filter((t) => t.category === category) : templates;
}
