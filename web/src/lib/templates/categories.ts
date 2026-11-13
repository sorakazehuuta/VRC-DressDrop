// テンプレートのカテゴリ（template.json の category）。一覧の絞り込みはこの順番で並べる
// 新しいカテゴリを使うときはここに足す（ここにないカテゴリも一覧には出るが、並びは最後になる）
export const TEMPLATE_CATEGORIES = ["グッズ", "パネル・ディスプレイ", "看板", "カフェ・バー用品", "フード・ドリンク"] as const;

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
