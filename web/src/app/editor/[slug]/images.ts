// アップロード画像の検証と、プレビュー用の縮小
export const IMAGE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxSide: 4096,
  previewSide: 2048,
  types: ["image/png", "image/jpeg"],
} as const;

export type LoadedImage = {
  id: string;
  file: File;
  name: string;
  width: number;
  height: number;
  // プレビュー描画用（長辺 2048px 以下に縮小済み）
  source: ImageBitmap;
};

export async function loadImage(file: File, id: string = crypto.randomUUID()): Promise<LoadedImage> {
  if (!(IMAGE_LIMITS.types as readonly string[]).includes(file.type)) {
    throw new Error("PNG または JPEG の画像を選んでください。");
  }
  if (file.size > IMAGE_LIMITS.maxBytes) {
    throw new Error("画像のサイズは 10MB までです。");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("画像を読み込めませんでした。ファイルが壊れていないか確認してください。");
  }
  const { width, height } = bitmap;
  if (Math.max(width, height) > IMAGE_LIMITS.maxSide) {
    bitmap.close();
    throw new Error(`画像の長辺は ${IMAGE_LIMITS.maxSide}px までです（選んだ画像: ${width}×${height}px）。`);
  }

  let source = bitmap;
  const scale = IMAGE_LIMITS.previewSide / Math.max(width, height);
  if (scale < 1) {
    source = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(width * scale),
      resizeHeight: Math.round(height * scale),
      resizeQuality: "high",
    });
    bitmap.close();
  }

  return { id, file, name: file.name, width, height, source };
}
