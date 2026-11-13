import type { Font } from "opentype.js";
import { printPlacement, type PrintParams } from "@/lib/templates/params";
import { layoutText } from "@/lib/templates/text";

// プリント面のテクスチャを canvas に描く。サーバー側の生成処理もこれと同じ見た目になるよう printPlacement を共有する
export function drawPrint(
  canvas: HTMLCanvasElement,
  params: PrintParams,
  image: { source: CanvasImageSource; width: number; height: number } | null,
  background: string | null,
  // 文字のフォント（読み込み中なら undefined で、文字は描かない）
  font?: Font,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (image) {
    const p = printPlacement(params, image, canvas);
    ctx.translate(p.centerX, p.centerY);
    ctx.rotate(p.rotationRad);
    ctx.filter = `brightness(${params.brightness}%) saturate(${params.saturation}%)`;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source, -p.width / 2, -p.height / 2, p.width, p.height);
  }
  ctx.restore();

  // 文字は画像の上に重ねる（明るさ・彩度は掛けない）。縁取りを先に描き、その上に文字を塗る（サーバーの textSvg と同じ）
  if (params.text && font) {
    const layout = layoutText(font, params.text, canvas);
    if (layout) {
      const path = new Path2D(layout.d);
      ctx.save();
      if (layout.strokeWidth > 0) {
        ctx.fillStyle = params.text.outlineColor;
        ctx.strokeStyle = params.text.outlineColor;
        ctx.lineWidth = layout.strokeWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.fill(path);
        ctx.stroke(path);
      }
      ctx.fillStyle = params.text.color;
      ctx.fill(path);
      ctx.restore();
    }
  }
}
