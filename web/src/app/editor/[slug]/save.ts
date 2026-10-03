import { createClient } from "@/lib/supabase/client";
import { WORK_IMAGES_BUCKET, workImagePath, workThumbnailPath } from "@/lib/works/constants";
import type { LoadedImage } from "./images";

export const imageExt = (image: LoadedImage) => (image.file.type === "image/png" ? "png" : "jpg");

// 画像は Server Action の容量制限（1MB）を超えるため、ブラウザから Storage へ直接アップロードする
export async function uploadImages(userId: string, workId: string, images: LoadedImage[]) {
  const bucket = createClient().storage.from(WORK_IMAGES_BUCKET);
  for (const image of images) {
    const { error } = await bucket.upload(workImagePath(userId, workId, image.id, imageExt(image)), image.file, {
      contentType: image.file.type,
      upsert: true,
    });
    if (error) throw new Error("画像をアップロードできませんでした。通信状況を確認して、もう一度お試しください。");
  }
}

export async function uploadThumbnail(userId: string, workId: string, blob: Blob) {
  const { error } = await createClient()
    .storage.from(WORK_IMAGES_BUCKET)
    .upload(workThumbnailPath(userId, workId), blob, { contentType: "image/jpeg", upsert: true });
  return !error;
}
