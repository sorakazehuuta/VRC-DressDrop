import { describe, expect, it } from "vitest";
import { backgroundColor, defaultParams, parseEditorParams, printPlacement, textureDimensions, type PrintParams } from "@/lib/templates/params";
import type { PrintSlot } from "@/lib/templates/schema";
import { slotsSchema } from "@/lib/templates/schema";
import { IMAGE_A, params, slots } from "../helpers/fixtures";

const printSlot = slots.find((s) => s.key === "print") as PrintSlot;
const stickerSlot = slots.find((s) => s.key === "sticker") as PrintSlot;

describe("編集内容の正規化（parseEditorParams）", () => {
  it("正しい内容はそのまま（色は小文字にそろえる）", () => {
    const p = params({ color: "#ABCDEF", print: { scaleX: 1.5, rotation: 30 } });
    const parsed = parseEditorParams(p, slots);
    expect(parsed.slots.base).toEqual({ kind: "color", color: "#abcdef" });
    expect(parsed.slots.print).toMatchObject({ imageId: IMAGE_A, scaleX: 1.5, rotation: 30 });
  });

  it("範囲外の値は上限・下限に丸める", () => {
    const parsed = parseEditorParams(params({ print: { scaleX: 99, scaleY: -1, offsetX: 5, rotation: -999, brightness: 500, saturation: -5 } }), slots);
    expect(parsed.slots.print).toMatchObject({ scaleX: 3, scaleY: 0.1, offsetX: 1, rotation: -180, brightness: 200, saturation: 0 });
  });

  it("壊れた値・種類が違う値は初期値に戻す", () => {
    const parsed = parseEditorParams({ slots: { base: { kind: "color", color: "red" }, print: { kind: "color", color: "#000000" } } }, slots);
    expect(parsed).toEqual(defaultParams(slots));
  });

  it("画像 ID が UUID でなければ、そのスロットは初期値に戻す", () => {
    const parsed = parseEditorParams(params({ imageId: "../../etc/passwd" }), slots);
    expect((parsed.slots.print as PrintParams).imageId).toBeNull();
  });

  it("定義にないスロットは捨て、足りないスロットは初期値で補う", () => {
    const parsed = parseEditorParams({ slots: { unknown: { kind: "color", color: "#000000" } } }, slots);
    expect(Object.keys(parsed.slots).sort()).toEqual(["base", "print", "sticker"]);
  });

  it("null や文字列が来ても初期値を返す", () => {
    expect(parseEditorParams(null, slots)).toEqual(defaultParams(slots));
    expect(parseEditorParams("x", slots)).toEqual(defaultParams(slots));
  });
});

describe("プリントの配置（ブラウザとサーバーで共通）", () => {
  const p = (over: Partial<PrintParams> = {}) => ({ ...(defaultParams(slots).slots.print as PrintParams), ...over });

  it("scale=1 で、画像がプリント面に収まる大きさ（contain）になる", () => {
    const r = printPlacement(p(), { width: 1000, height: 500 }, { width: 512, height: 512 });
    expect(r.width).toBe(512);
    expect(r.height).toBe(256);
    expect([r.centerX, r.centerY]).toEqual([256, 256]);
  });

  it("位置は面の半分を 1 とし、上が正（画像の座標は下が正なので反転する）", () => {
    const r = printPlacement(p({ offsetX: 1, offsetY: 1 }), { width: 100, height: 100 }, { width: 200, height: 100 });
    expect([r.centerX, r.centerY]).toEqual([200, 0]);
  });

  it("回転は度からラジアンにする", () => {
    expect(printPlacement(p({ rotation: 90 }), { width: 1, height: 1 }, { width: 1, height: 1 }).rotationRad).toBeCloseTo(Math.PI / 2);
  });
});

describe("テクスチャの大きさと背景", () => {
  it("長辺を textureSize にし、面の縦横比に合わせる", () => {
    expect(textureDimensions(printSlot)).toEqual({ width: 512, height: 256 });
    expect(textureDimensions({ ...printSlot, aspect: 0.5 })).toEqual({ width: 256, height: 512 });
  });

  it("背景に色スロットを指定した面はその色、透明の面は null", () => {
    expect(backgroundColor(printSlot, params({ color: "#123456" }))).toBe("#123456");
    expect(backgroundColor(stickerSlot, params())).toBeNull();
  });
});

describe("スロット定義の検証", () => {
  it("key の重複を拒否する", () => {
    expect(() => slotsSchema.parse([slots[0], slots[0]])).toThrow(/重複/);
  });

  it("背景に色以外のスロットを指定したら拒否する", () => {
    expect(() =>
      slotsSchema.parse([
        { key: "a", type: "print", label: "A", material: "A" },
        { key: "b", type: "print", label: "B", material: "B", background: { slot: "a" } },
      ]),
    ).toThrow(/background/);
  });

  it("Quest の上限を超えるテクスチャの大きさを拒否する", () => {
    expect(() => slotsSchema.parse([{ key: "a", type: "print", label: "A", material: "A", textureSize: 4096 }])).toThrow();
  });
});
