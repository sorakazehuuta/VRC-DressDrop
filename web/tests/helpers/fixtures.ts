import { defaultParams, type EditorParams, type PrintParams } from "@/lib/templates/params";
import { slotsSchema } from "@/lib/templates/schema";

// テスト用のテンプレート: 本体の色・プリント面（背景は本体の色）・透明なステッカー面
export const slots = slotsSchema.parse([
  { key: "base", type: "color", label: "本体の色", material: "Mat_Base", defaultColor: "#ffffff" },
  { key: "print", type: "print", label: "プリント", material: "Mat_Print", background: { slot: "base" }, aspect: 2, textureSize: 512 },
  { key: "sticker", type: "print", label: "ステッカー", material: "Mat_Sticker", textureSize: 256 },
]);

export const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
export const IMAGE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const IMAGE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// 本体の色とプリントの画像・配置を指定した編集内容
export function params(opts: { color?: string; imageId?: string | null; print?: Partial<PrintParams> } = {}): EditorParams {
  const p = defaultParams(slots);
  p.slots.base = { kind: "color", color: opts.color ?? "#ffffff" };
  p.slots.print = { ...(p.slots.print as PrintParams), imageId: opts.imageId === undefined ? IMAGE_A : opts.imageId, ...opts.print };
  return p;
}
