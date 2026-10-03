import { z } from "zod";

// テンプレート定義（templates/<slug>/template.json と DB の templates.slots の形式）
// サーバー・ブラウザ・同期スクリプトの全てから使うため、Node 専用のモジュールや "@/..." を import しないこと

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB 形式で指定してください");
const slotKey = z.string().regex(/^[a-z][a-z0-9_]*$/, "英小文字・数字・_ で指定してください");

export const colorSlotSchema = z.object({
  key: slotKey,
  type: z.literal("color"),
  label: z.string().min(1),
  // 3Dモデル内のマテリアル名（Blender で付けた名前と完全一致）
  material: z.string().min(1),
  defaultColor: hexColor.default("#ffffff"),
});

export const printSlotSchema = z.object({
  key: slotKey,
  type: z.literal("print"),
  label: z.string().min(1),
  material: z.string().min(1),
  // 画像のない部分を何で埋めるか。プリント面が本体の一部（穴が開くと困る）なら色スロットを指定する
  background: z.union([z.literal("transparent"), z.object({ slot: slotKey })]).default("transparent"),
  // プリント面の実寸の 幅÷高さ。UV が実寸と違う比率のとき、画像が伸びないよう補正する
  aspect: z.number().positive().default(1),
  // 出力テクスチャの長辺ピクセル数（Quest の上限に合わせて最大 2048）
  textureSize: z.number().int().min(256).max(2048).default(2048),
});

export const slotSchema = z.discriminatedUnion("type", [colorSlotSchema, printSlotSchema]);

export const slotsSchema = z
  .array(slotSchema)
  .min(1)
  .superRefine((slots, ctx) => {
    const keys = new Set<string>();
    for (const [i, slot] of slots.entries()) {
      if (keys.has(slot.key)) ctx.addIssue({ code: "custom", path: [i, "key"], message: `key "${slot.key}" が重複しています` });
      keys.add(slot.key);
    }
    for (const [i, slot] of slots.entries()) {
      if (slot.type !== "print" || slot.background === "transparent") continue;
      const target = slots.find((s) => s.key === (slot.background as { slot: string }).slot);
      if (!target || target.type !== "color") {
        ctx.addIssue({ code: "custom", path: [i, "background"], message: "background には type が color のスロットの key を指定してください" });
      }
    }
  });

export const templateManifestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "英小文字・数字・- で指定してください"),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().default(""),
  tokenCost: z.number().int().positive(),
  isPublic: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  files: z.object({
    preview: z.string().regex(/\.glb$/i, "プレビュー用モデルは .glb を指定してください"),
    package: z.string().regex(/\.fbx$/i, "同梱用モデルは .fbx を指定してください"),
    thumbnail: z
      .string()
      .regex(/\.(png|jpe?g|webp)$/i)
      .optional(),
  }),
  slots: slotsSchema,
});

export type ColorSlot = z.infer<typeof colorSlotSchema>;
export type PrintSlot = z.infer<typeof printSlotSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
