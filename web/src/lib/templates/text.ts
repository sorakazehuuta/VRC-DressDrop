import type { Font } from "opentype.js";

// プリント面に入れる文字（価格札・お品書き・「新刊」など）。
// 文字はフォントから線の形（SVG のパス）に変えて描く。ブラウザ（canvas の Path2D）とサーバー（SVG を sharp で描く）で
// 同じパスを使うので、どちらも同じ見た目になる。
// サーバー・ブラウザの両方から使うため、Node 専用のモジュールや "@/..." を import しないこと

export const TEXT_FONTS = {
  gothic: { file: "/fonts/MPLUS1p-Bold.ttf", label: "ゴシック", labelEn: "Gothic" },
  rounded: { file: "/fonts/MPLUSRounded1c-Bold.ttf", label: "丸ゴシック", labelEn: "Rounded" },
} as const;
export type TextFont = keyof typeof TEXT_FONTS;

export type TextAlign = "left" | "center" | "right";

export type PrintText = {
  content: string;
  font: TextFont;
  size: number; // 文字の大きさ。印刷面の短い辺に対する割合
  color: string; // #rrggbb
  outlineColor: string;
  outlineWidth: number; // 縁取りの太さ。文字の大きさに対する割合（0 で縁取りなし）
  align: TextAlign;
  offsetX: number; // 文字のかたまりの中心。-1（左端）〜 1（右端）
  offsetY: number; // -1（下端）〜 1（上端）
};

export const TEXT_LIMITS = {
  maxLength: 200,
  maxLines: 8,
  size: { min: 0.03, max: 0.6, step: 0.005 },
  outlineWidth: { min: 0, max: 0.25, step: 0.005 },
  offset: { min: -1, max: 1, step: 0.005 },
} as const;

export function defaultPrintText(): PrintText {
  return {
    content: "",
    font: "gothic",
    size: 0.12,
    color: "#031e42",
    outlineColor: "#ffffff",
    outlineWidth: 0.08,
    align: "center",
    offsetX: 0,
    offsetY: 0,
  };
}

const LINE_HEIGHT = 1.3;

// 文字のパス（SVG の d 属性）と、縁取りの線の太さ（px）。文字がなければ null
export function layoutText(font: Font, text: PrintText, canvas: { width: number; height: number }): { d: string; strokeWidth: number } | null {
  const lines = text.content.split("\n").slice(0, TEXT_LIMITS.maxLines);
  if (!lines.some((l) => l.trim())) return null;
  const px = text.size * Math.min(canvas.width, canvas.height);
  const lineHeight = px * LINE_HEIGHT;
  const unit = px / font.unitsPerEm;
  const ascent = font.ascender * unit;
  const descent = -font.descender * unit;
  const widths = lines.map((line) => font.getAdvanceWidth(line, px, { kerning: true }));
  const blockWidth = Math.max(...widths);
  const blockHeight = lines.length * lineHeight;
  const cx = canvas.width * (0.5 + text.offsetX / 2);
  const cy = canvas.height * (0.5 - text.offsetY / 2);
  const top = cy - blockHeight / 2;

  const parts: string[] = [];
  lines.forEach((line, i) => {
    if (!line) return;
    const x = text.align === "left" ? cx - blockWidth / 2 : text.align === "right" ? cx + blockWidth / 2 - widths[i] : cx - widths[i] / 2;
    // 行の高さの中で、文字（アセンダー〜ディセンダー）が上下の中央に来る位置を基準線にする
    const baseline = top + i * lineHeight + (lineHeight - (ascent + descent)) / 2 + ascent;
    parts.push(font.getPath(line, x, baseline, px, { kerning: true }).toPathData(2));
  });
  return { d: parts.join(""), strokeWidth: text.outlineWidth * px * 2 };
}

// サーバーで描くための SVG。縁取りを先に描き、その上に文字を塗る（ブラウザの drawText と同じ順番）
export function textSvg(layout: { d: string; strokeWidth: number }, text: PrintText, canvas: { width: number; height: number }) {
  const outline =
    layout.strokeWidth > 0
      ? `<path d="${layout.d}" fill="${text.outlineColor}" stroke="${text.outlineColor}" stroke-width="${layout.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${outline}<path d="${layout.d}" fill="${text.color}"/></svg>`;
}
