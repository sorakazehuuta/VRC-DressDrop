// テンプレート一覧の並べ替え。「おすすめ順」は管理画面で並べた順番（サーバーから届いた順番）
export const templateSorts = {
  recommended: "おすすめ順",
  newest: "新しい順",
  "cost-asc": "トークンが少ない順",
  "cost-desc": "トークンが多い順",
  name: "名前順（あいうえお）",
} as const;

export type TemplateSort = keyof typeof templateSorts;

export function parseTemplateSort(value: unknown): TemplateSort {
  return typeof value === "string" && value in templateSorts ? (value as TemplateSort) : "recommended";
}

type Sortable = { name: string; nameReading: string; tokenCost: number; createdAt: string };

const collator = new Intl.Collator("ja", { numeric: true });
const reading = (t: Sortable) => t.nameReading || t.name;

// 同じ値のものは、おすすめ順のまま並べる
export function sortTemplates<T extends Sortable>(templates: T[], sort: TemplateSort): T[] {
  const indexed = templates.map((t, i) => ({ t, i }));
  const compare: (a: T, b: T) => number = {
    recommended: () => 0,
    newest: (a: T, b: T) => b.createdAt.localeCompare(a.createdAt),
    "cost-asc": (a: T, b: T) => a.tokenCost - b.tokenCost,
    "cost-desc": (a: T, b: T) => b.tokenCost - a.tokenCost,
    name: (a: T, b: T) => collator.compare(reading(a), reading(b)),
  }[sort];
  return indexed.sort((a, b) => compare(a.t, b.t) || a.i - b.i).map(({ t }) => t);
}

// 名前・読み・説明・分類のどれかに含まれるものに絞る（ひらがな・カタカナ、大文字・小文字は区別しない）
const normalize = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export function filterTemplates<T extends Sortable & { description: string; category: string }>(templates: T[], query: string): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return templates;
  return templates.filter((t) => {
    const text = normalize([t.name, t.nameReading, t.description, t.category].join(" "));
    return words.every((w) => text.includes(w));
  });
}
