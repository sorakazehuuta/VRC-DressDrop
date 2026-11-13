import { z } from "zod";
import type { PrintSlot } from "./schema";

// アクリルの板の形（利用者が選ぶ）。印刷面の定義に outline があるときだけ使う。
// ブラウザ・サーバー・単体テストから使うため、Node 専用のモジュールや "@/..." を import しないこと

export type PrintOutline = NonNullable<PrintSlot["outline"]>;

export type AcrylicParams =
  // 絵の形に切り抜く。border: 縁取りの幅（印刷面の短い辺に対する割合）
  | { shape: "cutout"; border: number }
  // 四角のまま。width: 印刷面の幅に対する割合、height: 四角を置ける高さ（印刷面の高さから下の帯の分を除いたもの）に対する割合
  | { shape: "rect"; width: number; height: number; rounded: boolean };

export const ACRYLIC_LIMITS = {
  border: { min: 0.01, max: 0.1, step: 0.001 },
  size: { min: 0.3, max: 1, step: 0.005 },
} as const;

// 「四角のまま」に切り替えたときの最初の形（いちばん大きい四角、角は丸める）
export const DEFAULT_RECT: AcrylicParams = { shape: "rect", width: 1, height: 1, rounded: true };

// 編集内容に項目がないとき（テンプレートの既定）の形
export const defaultAcrylic = (outline: PrintOutline): AcrylicParams => ({ shape: "cutout", border: outline.width });

export const resolveAcrylic = (outline: PrintOutline, params: AcrylicParams | undefined): AcrylicParams => params ?? defaultAcrylic(outline);

const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v));

const acrylicSchema = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("cutout"), border: z.number() }),
  z.object({ shape: z.literal("rect"), width: z.number(), height: z.number(), rounded: z.boolean() }),
]);

// 形の正規化。テンプレートの既定（絵の形・既定の縁取りの幅）と同じなら undefined（項目を持たない。以前の作品と同じ版のハッシュにするため）
export function parseAcrylic(raw: unknown, outline: PrintOutline | undefined): AcrylicParams | undefined {
  if (!outline) return undefined;
  const parsed = acrylicSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const a = parsed.data;
  if (a.shape === "cutout") {
    const border = clamp(a.border, ACRYLIC_LIMITS.border);
    return isDefaultBorder(border, outline) ? undefined : { shape: "cutout", border };
  }
  return { shape: "rect", width: clamp(a.width, ACRYLIC_LIMITS.size), height: clamp(a.height, ACRYLIC_LIMITS.size), rounded: a.rounded };
}

// スライダーの刻みや mm からの換算で出る小さな誤差は、既定と同じとみなす
const isDefaultBorder = (border: number, outline: PrintOutline) => Math.abs(border - outline.width) < 1e-6;

// 画面の操作から作った形を、既定と同じなら undefined にする（編集内容に項目を残さない）
export const normalizeAcrylic = (a: AcrylicParams, outline: PrintOutline): AcrylicParams | undefined =>
  a.shape === "cutout" && isDefaultBorder(a.border, outline) ? undefined : a;

// 四角（と差し込む帯）の位置。単位は画素（画像の上が y=0）
export function rectGeometry(outline: PrintOutline, a: Extract<AcrylicParams, { shape: "rect" }>, width: number, height: number) {
  // 差し込む帯がないテンプレートでは、四角の下端を面の下端に置く
  const bottom = outline.tab > 0 ? height * (1 - outline.rectBottom) : height;
  const w = a.width * width;
  const h = a.height * bottom;
  const left = (width - w) / 2;
  const radius = a.rounded ? Math.min(outline.cornerRadius * Math.min(width, height), w / 2, h / 2) : 0;
  // 帯は角の丸みにかからない幅にする
  const tabWidth = Math.max(0, Math.min(outline.tab * width, w - radius * 2));
  return { left, top: bottom - h, right: left + w, bottom, radius, tabLeft: (width - tabWidth) / 2, tabRight: (width + tabWidth) / 2 };
}
