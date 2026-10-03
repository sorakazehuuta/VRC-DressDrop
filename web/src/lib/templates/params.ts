import { z } from "zod";
import type { ColorSlot, PrintSlot, Slot } from "./schema";

// エディタの編集内容。works.params にこの形で保存し、unitypackage 生成時もこれを元にテクスチャを作る

export type PrintParams = {
  kind: "print";
  imageId: string | null;
  scaleX: number;
  scaleY: number;
  keepAspect: boolean;
  offsetX: number; // -1（左端）〜 1（右端）
  offsetY: number; // -1（下端）〜 1（上端）
  rotation: number; // 度。時計回りが正
  brightness: number; // %
  saturation: number; // %
};

export type ColorParams = { kind: "color"; color: string };

export type SlotParams = PrintParams | ColorParams;

export type EditorParams = { version: 1; slots: Record<string, SlotParams> };

export const PRINT_LIMITS = {
  scale: { min: 0.1, max: 3, step: 0.01 },
  offset: { min: -1, max: 1, step: 0.005 },
  rotation: { min: -180, max: 180, step: 1 },
  brightness: { min: 0, max: 200, step: 1 },
  saturation: { min: 0, max: 200, step: 1 },
} as const;

export function defaultPrintParams(): PrintParams {
  return {
    kind: "print",
    imageId: null,
    scaleX: 1,
    scaleY: 1,
    keepAspect: true,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    brightness: 100,
    saturation: 100,
  };
}

export function defaultSlotParams(slot: Slot): SlotParams {
  return slot.type === "print" ? defaultPrintParams() : { kind: "color", color: (slot as ColorSlot).defaultColor };
}

export function defaultParams(slots: Slot[]): EditorParams {
  return { version: 1, slots: Object.fromEntries(slots.map((s) => [s.key, defaultSlotParams(s)])) };
}

export function textureDimensions(slot: PrintSlot) {
  return slot.aspect >= 1
    ? { width: slot.textureSize, height: Math.round(slot.textureSize / slot.aspect) }
    : { width: Math.round(slot.textureSize * slot.aspect), height: slot.textureSize };
}

// プリント画像の配置。scale=1 で画像がプリント面に収まる大きさ（contain）になる。
// ブラウザ（canvas）とサーバー（unitypackage 生成）で同じ計算を使うこと
export function printPlacement(params: PrintParams, image: { width: number; height: number }, canvas: { width: number; height: number }) {
  const fit = Math.min(canvas.width / image.width, canvas.height / image.height);
  return {
    centerX: canvas.width * (0.5 + params.offsetX / 2),
    centerY: canvas.height * (0.5 - params.offsetY / 2),
    width: image.width * fit * params.scaleX,
    height: image.height * fit * params.scaleY,
    rotationRad: (params.rotation * Math.PI) / 180,
  };
}

export function backgroundColor(slot: PrintSlot, params: EditorParams): string | null {
  if (slot.background === "transparent") return null;
  const bg = params.slots[slot.background.slot];
  return bg?.kind === "color" ? bg.color : null;
}

const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v));

const printParamsSchema = z.object({
  kind: z.literal("print"),
  imageId: z.uuid().nullable(),
  scaleX: z.number(),
  scaleY: z.number(),
  keepAspect: z.boolean(),
  offsetX: z.number(),
  offsetY: z.number(),
  rotation: z.number(),
  brightness: z.number(),
  saturation: z.number(),
});
const colorParamsSchema = z.object({ kind: z.literal("color"), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });

// 保存データやクライアントから届いた値を、テンプレートのスロット定義に合わせて正規化する。
// 範囲外の値は丸め、壊れている・種類が違うスロットは初期値に戻し、定義にないスロットは捨てる
export function parseEditorParams(raw: unknown, slots: Slot[]): EditorParams {
  const input = (raw as { slots?: Record<string, unknown> } | null)?.slots ?? {};
  const result = defaultParams(slots);
  for (const slot of slots) {
    const value = input[slot.key];
    if (slot.type === "print") {
      const parsed = printParamsSchema.safeParse(value);
      if (!parsed.success) continue;
      const p = parsed.data;
      result.slots[slot.key] = {
        ...p,
        scaleX: clamp(p.scaleX, PRINT_LIMITS.scale),
        scaleY: clamp(p.scaleY, PRINT_LIMITS.scale),
        offsetX: clamp(p.offsetX, PRINT_LIMITS.offset),
        offsetY: clamp(p.offsetY, PRINT_LIMITS.offset),
        rotation: clamp(p.rotation, PRINT_LIMITS.rotation),
        brightness: clamp(p.brightness, PRINT_LIMITS.brightness),
        saturation: clamp(p.saturation, PRINT_LIMITS.saturation),
      };
    } else {
      const parsed = colorParamsSchema.safeParse(value);
      if (parsed.success) result.slots[slot.key] = { kind: "color", color: parsed.data.color.toLowerCase() };
    }
  }
  return result;
}
