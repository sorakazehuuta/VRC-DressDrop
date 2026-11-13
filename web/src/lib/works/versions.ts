import { createHash } from "node:crypto";
import type { GimmickSelection } from "@/lib/gimmicks/schema";
import type { EditorParams } from "@/lib/templates/params";

// 課金の単位「版」の判定と、ダウンロードに必要なトークン数の計算（DB に触れない部分）。
// 使う側は app/works/download.ts

// 内訳の1行。paid は「この土台の版で購入済み」なら true（今回は消費しない）
export type CostLine = { label: string; cost: number; paid: boolean };

// 未取得の版の種類。first: この作品をまだ取得していない / changed: 取得済みの版から見た目が変わった /
// gimmicks: 見た目は取得済みで、ギミックだけが増えた
export type VersionKind = "first" | "changed" | "gimmicks";

// 「土台の版」: テンプレートと見た目の編集内容。ギミックは含めない
export function versionHash(templateId: string, params: EditorParams) {
  return createHash("sha256").update(JSON.stringify({ templateId, params })).digest("hex");
}

// 画像 ID を画像の中身のハッシュに置き換えた編集内容。同じ画像を貼り直しても同じ版になる。
// ハッシュが未登録の画像は ID のまま（すべて未登録なら以前の方式の版と同じになる）
export function withContentKeys(params: EditorParams, contentHashes: Map<string, string>): EditorParams {
  const slots = Object.fromEntries(
    Object.entries(params.slots).map(([key, slot]) => [
      key,
      slot.kind === "print" && slot.imageId ? { ...slot, imageId: contentHashes.get(slot.imageId) ?? slot.imageId } : slot,
    ]),
  );
  return { ...params, slots };
}

// ギミックまで含めた版。ギミックがなければ土台の版と同じ（ギミック導入前の購入と互換）
export function fullVersionHash(baseHash: string, gimmicks: GimmickSelection[]) {
  if (gimmicks.length === 0) return baseHash;
  return createHash("sha256").update(JSON.stringify({ baseHash, gimmicks })).digest("hex");
}

// 作品の今の内容の版。新しい購入は baseHash / hash（画像の中身で計算）で記録し、
// 購入済みの判定には以前の方式（画像 ID で計算）のハッシュも使う
export function workVersions(templateId: string, params: EditorParams, contentHashes: Map<string, string>, gimmicks: GimmickSelection[]) {
  const baseHash = versionHash(templateId, withContentKeys(params, contentHashes));
  const legacyBaseHash = versionHash(templateId, params);
  return {
    baseHash,
    hash: fullVersionHash(baseHash, gimmicks),
    baseHashes: [...new Set([baseHash, legacyBaseHash])],
    fullHashes: [...new Set([fullVersionHash(baseHash, gimmicks), fullVersionHash(legacyBaseHash, gimmicks)])],
  };
}

// 同じ土台の版の購入（base_hash か params_hash が baseHashes のどれかに一致するもの）
export type RelatedPurchase = { id: string; params_hash: string; gimmick_slugs: string[] | null };

// 同じ版の購入があれば purchase に入る（再ダウンロードは無料）。
// なければ、土台の版が購入済みならギミックの未購入分だけ、未購入ならテンプレートと全ギミックの分を数える
// modelLabel: 内訳のテンプレートの行の名前（省略すると「<名前>（モデル）」）
export function priceVersion<P extends RelatedPurchase>(opts: {
  template: { name: string; tokenCost: number };
  gimmicks: { slug: string; name: string; tokenCost: number }[];
  related: P[];
  fullHashes: string[];
  modelLabel?: (name: string) => string;
}) {
  const purchase = opts.related.find((p) => opts.fullHashes.includes(p.params_hash)) ?? null;
  const basePaid = opts.related.length > 0;
  const paidSlugs = new Set(opts.related.flatMap((p) => p.gimmick_slugs ?? []));
  const breakdown: CostLine[] = [
    { label: opts.modelLabel ? opts.modelLabel(opts.template.name) : `${opts.template.name}（モデル）`, cost: opts.template.tokenCost, paid: basePaid },
    ...opts.gimmicks.map((g) => ({ label: g.name, cost: g.tokenCost, paid: paidSlugs.has(g.slug) })),
  ];
  const cost = breakdown.reduce((sum, line) => sum + (line.paid ? 0 : line.cost), 0);
  return { purchase, basePaid, breakdown, cost };
}

// hasAnyPurchase: この作品に、どの版でも購入があるか
export function versionKindOf(basePaid: boolean, hasAnyPurchase: boolean): VersionKind {
  if (basePaid) return "gimmicks";
  return hasAnyPurchase ? "changed" : "first";
}
