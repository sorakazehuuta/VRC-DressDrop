import { describe, expect, it } from "vitest";
import { fullVersionHash, priceVersion, versionHash, versionKindOf, withContentKeys, workVersions, type RelatedPurchase } from "@/lib/works/versions";
import { IMAGE_A, IMAGE_B, TEMPLATE_ID, params } from "../helpers/fixtures";

const OTHER_TEMPLATE = "22222222-2222-4222-8222-222222222222";
const HASH_X = "x".repeat(64);
const spin = { slug: "spin", params: { speed: 45 } };

describe("版のハッシュ", () => {
  it("同じ内容なら毎回同じ値になる", () => {
    expect(versionHash(TEMPLATE_ID, params())).toBe(versionHash(TEMPLATE_ID, params()));
  });

  it("テンプレート・色・配置・画像のどれかが違えば別の版になる", () => {
    const base = versionHash(TEMPLATE_ID, params());
    expect(versionHash(OTHER_TEMPLATE, params())).not.toBe(base);
    expect(versionHash(TEMPLATE_ID, params({ color: "#000000" }))).not.toBe(base);
    expect(versionHash(TEMPLATE_ID, params({ print: { offsetX: 0.1 } }))).not.toBe(base);
    expect(versionHash(TEMPLATE_ID, params({ imageId: IMAGE_B }))).not.toBe(base);
  });

  it("ギミックがなければ、ギミックまで含めた版は土台の版と同じ（ギミック導入前の購入と互換）", () => {
    const base = versionHash(TEMPLATE_ID, params());
    expect(fullVersionHash(base, [])).toBe(base);
    expect(fullVersionHash(base, [spin])).not.toBe(base);
  });

  it("ギミックの設定値が違えば、ギミックまで含めた版は別になる", () => {
    const base = versionHash(TEMPLATE_ID, params());
    expect(fullVersionHash(base, [spin])).not.toBe(fullVersionHash(base, [{ slug: "spin", params: { speed: 90 } }]));
  });
});

describe("画像の中身のハッシュでの判定", () => {
  it("画像 ID が違っても、中身が同じなら同じ版になる（同じ画像の貼り直し）", () => {
    const a = workVersions(TEMPLATE_ID, params({ imageId: IMAGE_A }), new Map([[IMAGE_A, HASH_X]]), []);
    const b = workVersions(TEMPLATE_ID, params({ imageId: IMAGE_B }), new Map([[IMAGE_B, HASH_X]]), []);
    expect(a.baseHash).toBe(b.baseHash);
    expect(a.hash).toBe(b.hash);
  });

  it("中身が違えば別の版になる", () => {
    const a = workVersions(TEMPLATE_ID, params({ imageId: IMAGE_A }), new Map([[IMAGE_A, HASH_X]]), []);
    const b = workVersions(TEMPLATE_ID, params({ imageId: IMAGE_B }), new Map([[IMAGE_B, "y".repeat(64)]]), []);
    expect(a.baseHash).not.toBe(b.baseHash);
  });

  it("ハッシュが未登録なら、以前の方式（画像 ID）の版と同じになる", () => {
    const p = params();
    expect(versionHash(TEMPLATE_ID, withContentKeys(p, new Map()))).toBe(versionHash(TEMPLATE_ID, p));
    expect(workVersions(TEMPLATE_ID, p, new Map(), []).baseHashes).toHaveLength(1);
  });

  it("以前の方式の版も、購入済みの判定に使う", () => {
    const p = params();
    const v = workVersions(TEMPLATE_ID, p, new Map([[IMAGE_A, HASH_X]]), [spin]);
    const legacyBase = versionHash(TEMPLATE_ID, p);
    expect(v.baseHashes).toEqual([v.baseHash, legacyBase]);
    expect(v.fullHashes).toContain(fullVersionHash(legacyBase, [spin]));
  });

  it("画像のないスロットや色のスロットは変えない", () => {
    const p = params({ imageId: null });
    expect(withContentKeys(p, new Map([[IMAGE_A, HASH_X]]))).toEqual(p);
  });
});

describe("必要なトークン数", () => {
  const template = { name: "ケーキ", tokenCost: 2 };
  const defs = { spin: { slug: "spin", name: "回転", tokenCost: 1 }, light: { slug: "toggle-light", name: "ライト", tokenCost: 3 } };
  const purchase = (paramsHash: string, slugs: string[] = []): RelatedPurchase => ({ id: paramsHash, params_hash: paramsHash, gimmick_slugs: slugs });

  it("初めての版は、テンプレートと全ギミックの合計", () => {
    const r = priceVersion({ template, gimmicks: [defs.spin, defs.light], related: [], fullHashes: ["h"] });
    expect(r.cost).toBe(6);
    expect(r.purchase).toBeNull();
    expect(r.basePaid).toBe(false);
    expect(r.breakdown.map((l) => [l.label, l.cost, l.paid])).toEqual([
      ["ケーキ（モデル）", 2, false],
      ["回転", 1, false],
      ["ライト", 3, false],
    ]);
  });

  it("同じ版を購入済みなら、その購入を返す（再ダウンロードは無料）", () => {
    const r = priceVersion({ template, gimmicks: [defs.spin], related: [purchase("h", ["spin"])], fullHashes: ["h"] });
    expect(r.purchase?.id).toBe("h");
    expect(r.cost).toBe(0);
  });

  it("土台の版が購入済みでギミックを足したら、足したギミックの分だけ", () => {
    const r = priceVersion({ template, gimmicks: [defs.spin, defs.light], related: [purchase("old", ["spin"])], fullHashes: ["new"] });
    expect(r.purchase).toBeNull();
    expect(r.cost).toBe(3);
    expect(r.breakdown.filter((l) => l.paid).map((l) => l.label)).toEqual(["ケーキ（モデル）", "回転"]);
  });

  it("土台の版が購入済みで、ギミックを外した・設定値を変えただけなら 0", () => {
    expect(priceVersion({ template, gimmicks: [], related: [purchase("old", ["spin"])], fullHashes: ["new"] }).cost).toBe(0);
    expect(priceVersion({ template, gimmicks: [defs.spin], related: [purchase("old", ["spin"])], fullHashes: ["new"] }).cost).toBe(0);
  });

  it("土台の版の購入が複数あれば、どれかで買ったギミックは購入済み", () => {
    const related = [purchase("a", ["spin"]), purchase("b", ["toggle-light"])];
    expect(priceVersion({ template, gimmicks: [defs.spin, defs.light], related, fullHashes: ["c"] }).cost).toBe(0);
  });

  it("ギミック導入前の購入（gimmick_slugs がない）も、土台の版の購入として扱う", () => {
    const r = priceVersion({ template, gimmicks: [defs.spin], related: [{ id: "x", params_hash: "base", gimmick_slugs: null }], fullHashes: ["new"] });
    expect(r.basePaid).toBe(true);
    expect(r.cost).toBe(1);
  });

  it("トークン数 0 のテンプレートでも計算できる", () => {
    expect(priceVersion({ template: { name: "無料", tokenCost: 0 }, gimmicks: [], related: [], fullHashes: ["h"] }).cost).toBe(0);
  });
});

describe("未取得の版の種類", () => {
  it.each([
    [false, false, "first"],
    [false, true, "changed"],
    [true, true, "gimmicks"],
  ] as const)("basePaid=%s, 購入あり=%s → %s", (basePaid, any, kind) => {
    expect(versionKindOf(basePaid, any)).toBe(kind);
  });
});
