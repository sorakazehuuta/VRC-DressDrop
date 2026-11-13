import { z } from "zod";

// テンプレート定義（templates/<slug>/template.json と DB の templates.slots の形式）
// サーバー・ブラウザ・同期スクリプトの全てから使うため、Node 専用のモジュールや "@/..." を import しないこと

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB 形式で指定してください");
const slotKey = z.string().regex(/^[a-z][a-z0-9_]*$/, "英小文字・数字・_ で指定してください");

export const colorSlotSchema = z.object({
  key: slotKey,
  type: z.literal("color"),
  label: z.string().min(1),
  // 英語版の表示名（template.json では必須。templates:check で確かめる。DB の古い行で空なら label を出す）
  labelEn: z.string().default(""),
  // 3Dモデル内のマテリアル名（Blender で付けた名前と完全一致）
  material: z.string().min(1),
  defaultColor: hexColor.default("#ffffff"),
});

export const printSlotSchema = z.object({
  key: slotKey,
  type: z.literal("print"),
  label: z.string().min(1),
  labelEn: z.string().default(""),
  material: z.string().min(1),
  // 画像のない部分を何で埋めるか。プリント面が本体の一部（穴が開くと困る）なら色スロットを指定する
  background: z.union([z.literal("transparent"), z.object({ slot: slotKey })]).default("transparent"),
  // プリント面の実寸の 幅÷高さ。UV が実寸と違う比率のとき、画像が伸びないよう補正する
  aspect: z.number().positive().default(1),
  // 出力テクスチャの長辺ピクセル数（Quest の上限に合わせて最大 2048）
  textureSize: z.number().int().min(256).max(2048).default(2048),
  // アクリルの縁取り（絵の周りを半透明の板にする。アクリルスタンドなど。lib/templates/outline.ts）
  outline: z
    .object({
      width: z.number().min(0).max(0.2),
      color: hexColor.default("#ffffff"),
      opacity: z.number().min(0).max(1).default(0.3),
      edgeOpacity: z.number().min(0).max(1).default(0.7),
      tab: z.number().min(0).max(1).default(0),
    })
    .optional(),
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

export const templateManifestSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "英小文字・数字・- で指定してください"),
    name: z.string().min(1),
    // 名前の読み（ひらがな）。一覧の「名前順」に使う。初回の登録だけに使い、あとは管理画面で変える
    nameReading: z.string().max(100).default(""),
    category: z.string().min(1),
    description: z.string().default(""),
    // 英語版の名前と説明。日本語を変えたらこちらも直す
    en: z.object({ name: z.string().min(1), description: z.string().default("") }),
    tokenCost: z.number().int().positive(),
    isPublic: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    files: z.object({
      // Unity から書き出したテンプレート本体（モデル・マテリアル・Prefab 一式）
      package: z.string().regex(/\.unitypackage$/i, "テンプレートは .unitypackage を指定してください"),
      // 使う Prefab の Unity 上のパス（Assets/...）。パッケージに Prefab が1つだけなら省略できる
      prefab: z
        .string()
        .regex(/^Assets\/.+\.(prefab|fbx)$/i, "Assets/ から始まる .prefab のパスを指定してください")
        .optional(),
      // ブラウザのプレビュー用モデル。npm run templates:prepare が unitypackage から作る
      preview: z.string().regex(/\.glb$/i, "プレビュー用モデルは .glb を指定してください").default("preview.glb"),
      thumbnail: z
        .string()
        .regex(/\.(png|jpe?g|webp)$/i)
        .optional(),
    }),
    slots: slotsSchema,
  })
  .superRefine((t, ctx) => {
    for (const [i, slot] of t.slots.entries()) {
      if (!slot.labelEn.trim()) ctx.addIssue({ code: "custom", path: ["slots", i, "labelEn"], message: `スロット "${slot.key}" の英語の名前（labelEn）を書いてください` });
    }
  });

// 表示する言語に合わせたスロットの名前
export const slotLabel = (slot: { label: string; labelEn: string }, locale: "ja" | "en") => (locale === "en" && slot.labelEn ? slot.labelEn : slot.label);

export type ColorSlot = z.infer<typeof colorSlotSchema>;
export type PrintSlot = z.infer<typeof printSlotSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
