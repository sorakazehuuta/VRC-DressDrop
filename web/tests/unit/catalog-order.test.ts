import { describe, expect, it } from "vitest";
import { catalogSortOrders } from "@/lib/catalog-order";
import { filterTemplates, parseTemplateSort, sortTemplates } from "@/lib/templates/sort";

describe("管理画面の並び順", () => {
  const rows = [
    { id: "a", sort_order: 10 },
    { id: "b", sort_order: 20 },
    { id: "c", sort_order: 30 },
  ];

  it("送られた順番に 10 刻みで振り直す", () => {
    expect([...catalogSortOrders(rows, ["c", "a", "b"])]).toEqual([["c", 10], ["a", 20], ["b", 30]]);
  });

  it("送られてこなかった行は今の順番で最後に回し、知らない ID や重複は無視する", () => {
    expect([...catalogSortOrders(rows, ["b", "x", "b"])]).toEqual([["b", 10], ["a", 20], ["c", 30]]);
  });
});

describe("テンプレート一覧の並べ替え", () => {
  const t = (name: string, nameReading: string, tokenCost: number, createdAt: string) => ({ name, nameReading, tokenCost, createdAt, description: "", category: "グッズ" });
  const list = [
    t("缶", "かん", 1, "2026-11-07T00:00:00Z"),
    t("フォトボード", "ふぉとぼーど", 3, "2026-11-10T00:00:00Z"),
    t("本", "ほん", 1, "2026-11-07T00:00:00Z"),
    t("イーゼルボード", "", 2, "2026-11-10T00:00:00Z"),
  ];
  const names = (xs: typeof list) => xs.map((x) => x.name);

  it("おすすめ順は届いた順のまま", () => {
    expect(names(sortTemplates(list, "recommended"))).toEqual(["缶", "フォトボード", "本", "イーゼルボード"]);
  });

  it("名前順は読みで並べ、読みがなければ名前で並べる", () => {
    expect(names(sortTemplates(list, "name"))).toEqual(["イーゼルボード", "缶", "フォトボード", "本"]);
  });

  it("トークン数・新しい順は、同じ値ならおすすめ順を保つ", () => {
    expect(names(sortTemplates(list, "cost-asc"))).toEqual(["缶", "本", "イーゼルボード", "フォトボード"]);
    expect(names(sortTemplates(list, "cost-desc"))).toEqual(["フォトボード", "イーゼルボード", "缶", "本"]);
    expect(names(sortTemplates(list, "newest"))).toEqual(["フォトボード", "イーゼルボード", "缶", "本"]);
  });

  it("知らない並び順はおすすめ順になる", () => {
    expect(parseTemplateSort("price")).toBe("recommended");
    expect(parseTemplateSort(undefined)).toBe("recommended");
    expect(parseTemplateSort("name")).toBe("name");
  });

  it("検索はひらがな・カタカナを区別せず、読みでも見つかる", () => {
    expect(names(filterTemplates(list, "ボード"))).toEqual(["フォトボード", "イーゼルボード"]);
    expect(names(filterTemplates(list, "ぼーど"))).toEqual(["フォトボード", "イーゼルボード"]);
    expect(names(filterTemplates(list, "ほん"))).toEqual(["本"]);
    expect(names(filterTemplates(list, "  "))).toHaveLength(4);
  });
});
