export const MAX_WORKS_PER_USER = 20;
export const WORK_IMAGES_BUCKET = "work-images";

// ストレージ上のパス。RLS の都合で先頭は必ずユーザー ID にすること
export const workFolder = (userId: string, workId: string) => `${userId}/${workId}`;
export const workImagePath = (userId: string, workId: string, imageId: string, ext: "png" | "jpg") =>
  `${workFolder(userId, workId)}/${imageId}.${ext}`;
export const workThumbnailPath = (userId: string, workId: string) => `${workFolder(userId, workId)}/thumbnail.jpg`;
