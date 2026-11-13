import { describe, expect, it } from "vitest";
import { applyOutline, type PrintOutline } from "@/lib/templates/outline";

const OUTLINE: PrintOutline = { width: 0.05, color: "#ffffff", opacity: 0.3, edgeOpacity: 0.7, tab: 0.2, rectBottom: 0.05, cornerRadius: 0.06 };

// 透明な面の真ん中に、不透明な赤い四角（絵）を置く
function canvas(w: number, h: number, art: { x0: number; y0: number; x1: number; y1: number }) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = art.y0; y < art.y1; y++)
    for (let x = art.x0; x < art.x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 3] = 255;
    }
  return data;
}
const alphaAt = (data: Uint8ClampedArray, w: number, x: number, y: number) => data[(y * w + x) * 4 + 3];

describe("アクリルの縁取り（applyOutline）", () => {
  const w = 1000;
  const h = 1500;
  const art = { x0: 300, y0: 300, x1: 700, y1: 900 };
  const data = canvas(w, h, art);
  applyOutline(data, w, h, OUTLINE);
  const r = OUTLINE.width * w; // 50px

  it("絵の画素はそのまま", () => {
    expect(alphaAt(data, w, 500, 600)).toBe(255);
    expect(data[(600 * w + 500) * 4]).toBe(255);
  });

  it("絵の周り（幅の内側）は半透明の板になる", () => {
    expect(alphaAt(data, w, art.x0 - 20, 600)).toBe(Math.round(0.3 * 255));
    expect(alphaAt(data, w, 500, art.y0 - 20)).toBe(Math.round(0.3 * 255));
  });

  it("外周の細い線は濃い", () => {
    expect(alphaAt(data, w, art.x0 - Math.round(r) + 2, 600)).toBe(Math.round(0.7 * 255));
  });

  it("幅より外は透明のまま", () => {
    expect(alphaAt(data, w, art.x0 - r - 10, 600)).toBe(0);
    expect(alphaAt(data, w, 50, 50)).toBe(0);
  });

  it("台座に差し込む帯が、絵の下から面の下端まで中央に付く", () => {
    expect(alphaAt(data, w, 500, h - 1)).toBeGreaterThan(0);
    expect(alphaAt(data, w, 500, 1200)).toBeGreaterThan(0);
    // 帯の外（中央から離れた下のほう）は透明
    expect(alphaAt(data, w, 100, h - 1)).toBe(0);
  });

  it("絵がなければ何もしない", () => {
    const empty = new Uint8ClampedArray(100 * 100 * 4);
    applyOutline(empty, 100, 100, OUTLINE);
    expect(empty.every((v) => v === 0)).toBe(true);
  });
});
