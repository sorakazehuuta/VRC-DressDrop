import { z } from "zod";

// ギミック定義（web/gimmicks/catalog/<slug>.json と DB の gimmicks.definition の形式）
// サーバー・ブラウザ・同期スクリプトの全てから使うため、Node 専用のモジュールや "@/..." を import しないこと

const paramKey = z.string().regex(/^[a-z][A-Za-z0-9]*$/, "英字で始まる英数字（Unity のスクリプトのフィールド名と同じ）で指定してください");

const numberParam = z.object({
  key: paramKey,
  label: z.string().min(1),
  type: z.literal("number"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  default: z.number(),
  unit: z.string().default(""),
});
const booleanParam = z.object({ key: paramKey, label: z.string().min(1), type: z.literal("boolean"), default: z.boolean() });
const colorParam = z.object({
  key: paramKey,
  label: z.string().min(1),
  type: z.literal("color"),
  default: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
const selectParam = z.object({
  key: paramKey,
  label: z.string().min(1),
  type: z.literal("select"),
  options: z.array(z.object({ value: z.string(), label: z.string() })).min(2),
  default: z.string(),
});

export const gimmickParamSchema = z.discriminatedUnion("type", [numberParam, booleanParam, colorParam, selectParam]);

// Unity 側の組み立て手順（web/gimmicks/unity/Editor/VRPrintLabPrefabBuilder.cs が対応しているもの）
export const SETUP_STEPS = [
  "switch", // 本体の横に小さなスイッチを置き、スクリプトはスイッチに付ける
  "pivot-center", // 本体の中心を軸に動かすための親を作る
  "pivot-bottom", // 本体の底を軸に動かすための親を作る
  "particles-sparkle", // キラキラのパーティクル
  "particles-aura", // 立ちのぼる光の粒
  "light", // ポイントライト
  "trail", // 軌跡
  "transparent-materials", // 半透明用のマテリアルを複製
  "emission-static", // マテリアルを常に発光させる
  "emission-dynamic", // スクリプトから発光を変えられるようにする
  "magic-circle", // 足元に回る魔法陣
  "pickup", // VRC Pickup（手で持てる）
  "object-sync", // VRC Object Sync（位置を全員に同期）
] as const;

export const gimmickDefinitionSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "英小文字・数字・- で指定してください"),
    name: z.string().min(1),
    category: z.string().min(1),
    description: z.string().default(""),
    note: z.string().default(""),
    tokenCost: z.number().int().min(0),
    isPublic: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    // web/gimmicks/unity/Runtime/<script>.cs のクラス名（Unity 側の組み立てだけで済むものは null）
    script: z.string().regex(/^VRPL[A-Za-z0-9]+$/).nullable().default(null),
    // 同じグループのギミックは同時に選べない（例: 触ったときの動作は1つだけ）
    groups: z.array(z.string()).default([]),
    // このうちどれかと一緒に選んだときだけ使える
    requiresAny: z.array(z.string()).default([]),
    setup: z.array(z.enum(SETUP_STEPS)).default([]),
    params: z.array(gimmickParamSchema).default([]),
    // 画面には出さず、スクリプトのフィールドにそのまま渡す値（同じスクリプトを別のギミックとして使い回すとき用）
    fixed: z.record(paramKey, z.union([z.number(), z.boolean(), z.string()])).default({}),
  })
  .superRefine((g, ctx) => {
    const keys = new Set<string>();
    for (const [i, p] of g.params.entries()) {
      if (keys.has(p.key)) ctx.addIssue({ code: "custom", path: ["params", i, "key"], message: `key "${p.key}" が重複しています` });
      keys.add(p.key);
      if (p.type === "number" && (p.default < p.min || p.default > p.max || p.min >= p.max)) {
        ctx.addIssue({ code: "custom", path: ["params", i], message: "min < max、かつ default を範囲内にしてください" });
      }
      if (p.type === "select" && !p.options.some((o) => o.value === p.default)) {
        ctx.addIssue({ code: "custom", path: ["params", i, "default"], message: "default は options の value のどれかにしてください" });
      }
    }
  });

export type GimmickParam = z.infer<typeof gimmickParamSchema>;
export type GimmickDefinition = z.infer<typeof gimmickDefinitionSchema>;
export type GimmickParamValue = number | boolean | string;
export type GimmickSelection = { slug: string; params: Record<string, GimmickParamValue> };

export function defaultGimmickParams(def: GimmickDefinition): Record<string, GimmickParamValue> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

function normalizeParam(p: GimmickParam, raw: unknown): GimmickParamValue {
  switch (p.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return p.default;
      return Math.min(p.max, Math.max(p.min, Math.round(n / p.step) * p.step));
    }
    case "boolean":
      return typeof raw === "boolean" ? raw : p.default;
    case "color":
      return typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : p.default;
    case "select":
      return typeof raw === "string" && p.options.some((o) => o.value === raw) ? raw : p.default;
  }
}

// 選んだギミックがほかの選択とぶつかる理由（ぶつからなければ null）
export function gimmickConflict(def: GimmickDefinition, selected: GimmickSelection[], defs: Map<string, GimmickDefinition>): string | null {
  for (const s of selected) {
    if (s.slug === def.slug) continue;
    const other = defs.get(s.slug);
    if (other && other.groups.some((g) => def.groups.includes(g))) return `「${other.name}」と同時には使えません`;
  }
  if (def.requiresAny.length > 0 && !selected.some((s) => def.requiresAny.includes(s.slug))) {
    const names = def.requiresAny.map((slug) => defs.get(slug)?.name).filter(Boolean);
    return `「${names.join("」「")}」のどれかと一緒に使います`;
  }
  return null;
}

// 保存データやクライアントから届いた値を正規化する。
// 存在しない・非公開・ぶつかる組み合わせのギミックは捨て、設定値は範囲内に収める
export function parseGimmickSelection(raw: unknown, defs: Map<string, GimmickDefinition>): GimmickSelection[] {
  if (!Array.isArray(raw)) return [];
  const result: GimmickSelection[] = [];
  for (const item of raw) {
    const slug = (item as { slug?: unknown })?.slug;
    if (typeof slug !== "string" || result.some((r) => r.slug === slug)) continue;
    const def = defs.get(slug);
    if (!def) continue;
    const params = (item as { params?: Record<string, unknown> }).params ?? {};
    result.push({ slug, params: Object.fromEntries(def.params.map((p) => [p.key, normalizeParam(p, params[p.key])])) });
  }
  // 依存先が外れた・グループが重なるものを、後から選ばれたものから順に除く
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = result.length - 1; i >= 0; i--) {
      const def = defs.get(result[i].slug)!;
      const others = result.slice(0, i).concat(result.slice(i + 1));
      if (gimmickConflict(def, others, defs)) {
        result.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return result.sort((a, b) => (defs.get(a.slug)!.sortOrder - defs.get(b.slug)!.sortOrder) || a.slug.localeCompare(b.slug));
}
