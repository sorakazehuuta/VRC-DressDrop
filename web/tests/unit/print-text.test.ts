import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "opentype.js";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { parseEditorParams, type PrintParams } from "@/lib/templates/params";
import type { PrintSlot } from "@/lib/templates/schema";
import { defaultPrintText, layoutText } from "@/lib/templates/text";
import { versionHash } from "@/lib/works/versions";
import { params, slots } from "../helpers/fixtures";

vi.mock("server-only", () => ({}));
const { renderPrintTexture } = await import("@/lib/package/texture");

const printSlot = slots.find((s) => s.key === "print") as PrintSlot;
const gothic = () => {
  const buf = readFileSync(path.join(process.cwd(), "public/fonts/MPLUS1p-Bold.ttf"));
  return parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
};

describe("プリント面の文字（params の text）", () => {
  it("文字がない作品は、以前と同じ JSON（同じ版のハッシュ）になる", () => {
    const before = params({ print: { scaleX: 1.2 } });
    const parsed = parseEditorParams(before, slots);
    expect("text" in parsed.slots.print).toBe(false);
    expect(versionHash("t", parsed)).toBe(versionHash("t", parseEditorParams(JSON.parse(JSON.stringify(before)), slots)));
  });

  it("空の文字は項目ごと持たない", () => {
    const parsed = parseEditorParams(params({ print: { text: { ...defaultPrintText(), content: " \n " } } as Partial<PrintParams> }), slots);
    expect("text" in parsed.slots.print).toBe(false);
  });

  it("長さ・行数・範囲を丸め、改行と色をそろえる", () => {
    const text = { ...defaultPrintText(), content: "1\r\n2\r3\n4\n5\n6\n7\n8\n9\n10", size: 9, outlineWidth: -1, offsetX: 3, color: "#ABCDEF" };
    const parsed = parseEditorParams(params({ print: { text } as Partial<PrintParams> }), slots).slots.print as PrintParams;
    expect(parsed.text).toMatchObject({ content: "1\n2\n3\n4\n5\n6\n7\n8", size: 0.6, outlineWidth: 0, offsetX: 1, color: "#abcdef" });
  });

  it("書体・そろえ方が不正なら文字は捨てる", () => {
    const parsed = parseEditorParams(params({ print: { text: { ...defaultPrintText(), content: "x", font: "comic" } } as unknown as Partial<PrintParams> }), slots);
    expect("text" in parsed.slots.print).toBe(false);
  });

  it("文字のかたまりは、位置 0 のとき面の中央に来る", () => {
    const layout = layoutText(gothic(), { ...defaultPrintText(), content: "新刊 500円" }, { width: 1000, height: 500 });
    expect(layout).not.toBeNull();
    const xs = [...layout!.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
    const center = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(Math.abs(center - 500)).toBeLessThan(15);
  });

  it("サーバーで作るテクスチャに文字が描かれる（画像なし）", async () => {
    const p: PrintParams = { ...(parseEditorParams(params({}), slots).slots.print as PrintParams), imageId: null, text: { ...defaultPrintText(), content: "500円", color: "#ff0000", outlineWidth: 0, size: 0.4 } };
    const png = await renderPrintTexture(printSlot, p, null, null);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 1] < 60 && data[i + 3] > 200) red++;
    expect(red).toBeGreaterThan(1000);
  });
});
