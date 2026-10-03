import { printPlacement, type PrintParams } from "@/lib/templates/params";

// プリント面のテクスチャを canvas に描く。サーバー側の生成処理もこれと同じ見た目になるよう printPlacement を共有する
export function drawPrint(
  canvas: HTMLCanvasElement,
  params: PrintParams,
  image: { source: CanvasImageSource; width: number; height: number } | null,
  background: string | null,
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
}
