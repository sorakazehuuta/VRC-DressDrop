import "server-only";
import sharp from "sharp";
import { printPlacement, textureDimensions, type PrintParams } from "@/lib/templates/params";
import type { PrintSlot } from "@/lib/templates/schema";

// CSS の saturate() と同じ行列（https://www.w3.org/TR/filter-effects-1/#feColorMatrixElement）
function saturateMatrix(s: number): [[number, number, number], [number, number, number], [number, number, number]] {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// エディタの drawPrint（print-canvas.ts）と同じ見た目のテクスチャ PNG を作る
export async function renderPrintTexture(slot: PrintSlot, params: PrintParams, image: Buffer | null, background: string | null) {
  const canvas = textureDimensions(slot);
  const base = sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: background ? { ...hexToRgb(background), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  if (!image) return base.png().toBuffer();

  const source = sharp(image).rotate(); // EXIF の向きを反映
  const meta = await source.metadata();
  const size = { width: meta.autoOrient?.width ?? meta.width ?? 1, height: meta.autoOrient?.height ?? meta.height ?? 1 };
  const p = printPlacement(params, size, canvas);
  const width = Math.max(1, Math.round(p.width));
  const height = Math.max(1, Math.round(p.height));

  // CSS の filter と同じく brightness → saturate の順に、色だけに掛ける（アルファはそのまま）。
  // sharp は回転をサイズ変更より先に行うため、回転は別の処理に分ける
  // ブラウザは brightness の結果を 0〜255 に収めてから saturate するので、間で一度 8bit に書き出す
  const b = params.brightness / 100;
  const resized = await source.resize(width, height, { fit: "fill" }).ensureAlpha().png().toBuffer();
  const brightened = await sharp(resized).linear([b, b, b, 1], [0, 0, 0, 0]).png().toBuffer();
  const adjusted = await sharp(brightened).recomb(saturateMatrix(params.saturation / 100)).png().toBuffer();
  const rendered =
    params.rotation % 360 === 0
      ? await sharp(adjusted).png().toBuffer({ resolveWithObject: true })
      : await sharp(adjusted)
          .rotate(params.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer({ resolveWithObject: true });

  // 回転後の画像の中心を配置位置に合わせ、テクスチャからはみ出す部分は切り落とす
  const left = Math.round(p.centerX - rendered.info.width / 2);
  const top = Math.round(p.centerY - rendered.info.height / 2);
  const cropLeft = Math.max(0, -left);
  const cropTop = Math.max(0, -top);
  const cropWidth = Math.min(rendered.info.width - cropLeft, canvas.width - Math.max(0, left));
  const cropHeight = Math.min(rendered.info.height - cropTop, canvas.height - Math.max(0, top));
  if (cropWidth <= 0 || cropHeight <= 0) return base.png().toBuffer();

  const visible = await sharp(rendered.data)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
  return base
    .composite([{ input: visible, left: Math.max(0, left), top: Math.max(0, top) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
