"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { gimmickMap, listGimmicks } from "@/lib/gimmicks/queries";
import { parseGimmickSelection } from "@/lib/gimmicks/schema";
import { parseEditorParams } from "@/lib/templates/params";
import { slotsSchema } from "@/lib/templates/schema";
import { cancelDeletions, enqueueDeletions, processDeletions } from "@/lib/storage-deletions";
import { createClient } from "@/lib/supabase/server";
import { MAX_WORKS_PER_USER, WORK_IMAGES_BUCKET, workFolder, workImagePath, workThumbnailPath } from "@/lib/works/constants";
import { getMessages } from "@/i18n/server";
import { worksMessages } from "./messages";

type WorksMessages = (typeof worksMessages)["ja"];

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4096;

const saveInputSchema = z.object({
  workId: z.uuid(),
  templateId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  params: z.unknown(),
  gimmicks: z.unknown().optional(),
  images: z
    .array(
      z.object({
        id: z.uuid(),
        slot: z.string(),
        ext: z.enum(["png", "jpg"]),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .max(20),
  hasThumbnail: z.boolean(),
});

export type SaveWorkInput = z.input<typeof saveInputSchema>;
export type SaveWorkResult =
  | { ok: true; workId: string; savedImageIds: string[]; updatedAt: string }
  | { ok: false; error: string; code?: "login_required" | "limit" | "suspended" };

async function currentUserId(supabase: Supabase) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

// アップロードされたファイルが本当に PNG / JPEG で、サイズ制限内かを中身で確認する。
// 問題がなければ中身のハッシュ（版の判定に使う）を返す
async function verifyImage(supabase: Supabase, path: string, m: WorksMessages): Promise<{ error: string } | { hash: string }> {
  const { data, error } = await supabase.storage.from(WORK_IMAGES_BUCKET).download(path);
  if (error || !data) return { error: m.errors.uploadIncomplete };
  if (data.size > MAX_IMAGE_BYTES) return { error: m.errors.imageSize };
  const buffer = Buffer.from(await data.arrayBuffer());
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.format !== "png" && meta.format !== "jpeg") return { error: m.errors.imageType };
    if (Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_IMAGE_SIDE) return { error: m.errors.imageSide(MAX_IMAGE_SIDE) };
  } catch {
    return { error: m.errors.imageBroken };
  }
  return { hash: createHash("sha256").update(buffer).digest("hex") };
}

export async function saveWork(raw: SaveWorkInput): Promise<SaveWorkResult> {
  const m = await getMessages(worksMessages);
  const parsed = saveInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const error = issue?.path[0] === "name" ? (issue.code === "too_big" ? m.errors.nameTooLong : m.errors.nameRequired) : m.errors.invalidInput;
    return { ok: false, error };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: m.errors.loginToSave, code: "login_required" };

  const { data: template } = await supabase.from("templates").select("id, slots").eq("id", input.templateId).maybeSingle();
  if (!template) return { ok: false, error: m.errors.templateNotFound };
  const slots = slotsSchema.parse(template.slots);
  const params = parseEditorParams(input.params, slots);
  const gimmicks = parseGimmickSelection(input.gimmicks, gimmickMap(await listGimmicks()));

  // パラメータが参照する画像と、送られてきた画像一覧を突き合わせる
  const imagesById = new Map(input.images.map((img) => [img.id, img]));
  const referenced = new Map<string, (typeof input.images)[number]>();
  for (const slot of slots) {
    const p = params.slots[slot.key];
    if (p?.kind !== "print" || !p.imageId) continue;
    const image = imagesById.get(p.imageId);
    if (!image || image.slot !== slot.key) return { ok: false, error: m.errors.imageMismatch };
    referenced.set(image.id, image);
  }

  const { data: existing } = await supabase.from("works").select("id, status").eq("id", input.workId).maybeSingle();
  if (existing?.status === "suspended") {
    return { ok: false, error: m.errors.workSuspended, code: "suspended" };
  }
  if (!existing) {
    const { count } = await supabase.from("works").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= MAX_WORKS_PER_USER) {
      return {
        ok: false,
        error: m.errors.limitSave(MAX_WORKS_PER_USER),
        code: "limit",
      };
    }
  }

  const { data: storedImages } = existing
    ? await supabase.from("work_images").select("id, storage_path").eq("work_id", input.workId)
    : { data: [] as { id: string; storage_path: string }[] };
  const storedIds = new Set((storedImages ?? []).map((i) => i.id));

  const contentHashes = new Map<string, string>();
  for (const image of referenced.values()) {
    if (storedIds.has(image.id)) continue;
    const verified = await verifyImage(supabase, workImagePath(userId, input.workId, image.id, image.ext), m);
    if ("error" in verified) return { ok: false, error: verified.error };
    contentHashes.set(image.id, verified.hash);
  }

  const thumbnailPath = workThumbnailPath(userId, input.workId);
  const row = {
    name: input.name,
    params,
    gimmicks,
    ...(input.hasThumbnail ? { thumbnail_path: thumbnailPath } : {}),
  };
  const { data: saved, error: saveError } = existing
    ? await supabase.from("works").update(row).eq("id", input.workId).select("updated_at").single()
    : await supabase
        .from("works")
        .insert({ id: input.workId, user_id: userId, template_id: input.templateId, ...row })
        .select("updated_at")
        .single();
  if (saveError || !saved) return { ok: false, error: m.errors.saveFailed };

  // 使われなくなった画像を消し、新しい画像を登録する
  const stale = (storedImages ?? []).filter((i) => !referenced.has(i.id));
  if (stale.length > 0) {
    // キューに記録できなければ行も残し、次の保存で消し直す
    const deletionIds = await enqueueDeletions(
      stale.map((i) => ({ bucket: WORK_IMAGES_BUCKET, path: i.storage_path })),
      userId,
      "image_replaced",
    ).catch(() => null);
    if (deletionIds) {
      await supabase.from("work_images").delete().in("id", stale.map((i) => i.id));
      await processDeletions(deletionIds);
    }
  }
  const fresh = [...referenced.values()].filter((i) => !storedIds.has(i.id));
  if (fresh.length > 0) {
    const { error } = await supabase.from("work_images").insert(
      fresh.map((i) => ({
        id: i.id,
        work_id: input.workId,
        slot: i.slot,
        storage_path: workImagePath(userId, input.workId, i.id, i.ext),
        width: i.width,
        height: i.height,
        content_hash: contentHashes.get(i.id) ?? null,
      })),
    );
    if (error) return { ok: false, error: m.errors.imageRegister };
  }

  revalidatePath("/works");
  return { ok: true, workId: input.workId, savedImageIds: [...referenced.keys()], updatedAt: saved.updated_at };
}

async function removeFolder(supabase: Supabase, folder: string) {
  const { data } = await supabase.storage.from(WORK_IMAGES_BUCKET).list(folder, { limit: 1000 });
  const files = (data ?? []).filter((f) => f.id !== null).map((f) => `${folder}/${f.name}`);
  if (files.length > 0) await supabase.storage.from(WORK_IMAGES_BUCKET).remove(files);
}

// code: limit は保存できる作品数の上限に達したとき
export type WorkActionResult = { ok: true } | { ok: false; error: string; code?: "limit" };

export async function renameWork(workId: string, name: string): Promise<WorkActionResult> {
  const m = await getMessages(worksMessages);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return { ok: false, error: m.errors.nameLength };
  const supabase = await createClient();
  const { data, error } = await supabase.from("works").update({ name: trimmed }).eq("id", workId).select("id");
  if (error || !data?.length) return { ok: false, error: m.errors.renameFailed };
  revalidatePath("/works");
  return { ok: true };
}

export async function deleteWork(workId: string): Promise<WorkActionResult> {
  const m = await getMessages(worksMessages);
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: m.errors.login };
  const { data: work } = await supabase.from("works").select("id").eq("id", workId).eq("user_id", userId).maybeSingle();
  if (!work) return { ok: false, error: m.errors.deleteFailed };
  // 作品の行を消したあとでも消すべき画像を追跡できるよう、先にキューに記録する
  let deletionIds: string[];
  try {
    deletionIds = await enqueueDeletions([{ bucket: WORK_IMAGES_BUCKET, path: workFolder(userId, workId), prefix: true }], userId, "work_deleted");
  } catch {
    return { ok: false, error: m.errors.deleteFailedRetry };
  }
  const { data, error } = await supabase.from("works").delete().eq("id", workId).select("id");
  if (error || !data?.length) {
    await cancelDeletions(deletionIds);
    return { ok: false, error: m.errors.deleteFailed };
  }
  await processDeletions(deletionIds);
  revalidatePath("/works");
  return { ok: true };
}

// name を省略すると「（コピー）」を付けた名前になる
export async function duplicateWork(workId: string, name?: string): Promise<WorkActionResult> {
  const m = await getMessages(worksMessages);
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: m.errors.login };

  const { count } = await supabase.from("works").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_WORKS_PER_USER) {
    return { ok: false, error: m.errors.limitDuplicate(MAX_WORKS_PER_USER), code: "limit" };
  }

  const { data: source } = await supabase
    .from("works")
    .select("template_id, name, params, gimmicks, thumbnail_path, work_images(id, slot, storage_path, width, height, content_hash)")
    .eq("id", workId)
    .maybeSingle();
  if (!source) return { ok: false, error: m.errors.workNotFound };

  const newId = crypto.randomUUID();
  const bucket = supabase.storage.from(WORK_IMAGES_BUCKET);
  const idMap = new Map<string, string>();
  const newImages = [];
  for (const img of source.work_images) {
    const newImageId = crypto.randomUUID();
    const ext = img.storage_path.endsWith(".png") ? "png" : "jpg";
    const path = workImagePath(userId, newId, newImageId, ext);
    const { error } = await bucket.copy(img.storage_path, path);
    if (error) {
      await removeFolder(supabase, workFolder(userId, newId));
      return { ok: false, error: m.errors.imageCopy };
    }
    idMap.set(img.id, newImageId);
    newImages.push({
      id: newImageId,
      work_id: newId,
      slot: img.slot,
      storage_path: path,
      width: img.width,
      height: img.height,
      content_hash: img.content_hash,
    });
  }
  let thumbnailPath: string | null = null;
  if (source.thumbnail_path) {
    thumbnailPath = workThumbnailPath(userId, newId);
    if ((await bucket.copy(source.thumbnail_path, thumbnailPath)).error) thumbnailPath = null;
  }

  const params = structuredClone(source.params) as { slots?: Record<string, { imageId?: string | null }> };
  for (const slot of Object.values(params.slots ?? {})) {
    if (slot.imageId) slot.imageId = idMap.get(slot.imageId) ?? null;
  }

  const { error } = await supabase.from("works").insert({
    id: newId,
    user_id: userId,
    template_id: source.template_id,
    name: (name?.trim() || m.copyName(source.name)).slice(0, 100),
    params,
    gimmicks: source.gimmicks,
    thumbnail_path: thumbnailPath,
  });
  if (error) {
    await removeFolder(supabase, workFolder(userId, newId));
    return { ok: false, error: m.errors.duplicateFailed };
  }
  if (newImages.length > 0) await supabase.from("work_images").insert(newImages);

  revalidatePath("/works");
  return { ok: true };
}
