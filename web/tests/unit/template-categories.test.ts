import { describe, expect, it } from "vitest";
import { categoryOptions, filterByCategory, TEMPLATE_CATEGORIES } from "@/lib/templates/categories";

const t = (slug: string, category: string) => ({ slug, category });

describe("テンプレートのカテゴリ", () => {
  it("決めた順に並べ、件数を数える。テンプレートのないカテゴリは出さない", () => {
    const options = categoryOptions([t("a", "看板"), t("b", "グッズ"), t("c", "看板"), t("d", "フード・ドリンク")]);
    expect(options).toEqual([
      { name: "グッズ", count: 1 },
      { name: "看板", count: 2 },
      { name: "フード・ドリンク", count: 1 },
    ]);
  });

  it("決めていないカテゴリは最後に、名前の順で並べる", () => {
    const options = categoryOptions([t("a", "ぬいぐるみ"), t("b", "アクセサリー"), t("c", TEMPLATE_CATEGORIES[0])]);
    expect(options.map((o) => o.name)).toEqual([TEMPLATE_CATEGORIES[0], "アクセサリー", "ぬいぐるみ"]);
  });

  it("カテゴリで絞る。空ならすべて", () => {
    const list = [t("a", "看板"), t("b", "グッズ"), t("c", "看板")];
    expect(filterByCategory(list, "看板").map((x) => x.slug)).toEqual(["a", "c"]);
    expect(filterByCategory(list, "")).toBe(list);
    expect(filterByCategory(list, "ない")).toEqual([]);
  });
});
