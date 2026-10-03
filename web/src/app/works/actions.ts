"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { parseEditorParams } from "@/lib/templates/params";
import { slotsSchema } from "@/lib/templates/schema";
import { createClient } from "@/lib/supabase/server";
import { MAX_WORKS_PER_USER, WORK_IMAGES_BUCKET, workFolder, workImagePath, workThumbnailPath } from "@/lib/works/constants";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4096;

const saveInputSchema = z.object({
  workId: z.uuid(),
  templateId: z.uuid(),
  name: z.string().trim().min(1, "作品名を入力してください。").max(100, "作品名は100文字以内で入力してください。"),
  params: z.unknown(),
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

// アップロードされたファイルが本当に PNG / JPEG で、サイズ制限内かを中身で確認する
async function verifyImage(supabase: Supabase, path: string) {
  const { data, error } = await supabase.storage.from(WORK_IMAGES_BUCKET).download(path);
  if (error || !data) return "画像のアップロードが完了していません。もう一度保存してください。";
  if (data.size > MAX_IMAGE_BYTES) return "画像のサイズは 10MB までです。";
  try {
    const meta = await sharp(Buffer.from(await data.arrayBuffer())).metadata();
    if (meta.format !== "png" && meta.format !== "jpeg") return "PNG または JPEG の画像だけを使えます。";
    if (Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_IMAGE_SIDE) return `画像の長辺は ${MAX_IMAGE_SIDE}px までです。`;
  } catch {
    return "画像を読み込めませんでした。別の画像をお試しください。";
  }
  return null;
}

export async function saveWork(raw: SaveWorkInput): Promise<SaveWorkResult> {
  const parsed = saveInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容が正しくありません。" };
  const input = parsed.data;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "保存するにはログインしてください。", code: "login_required" };

  const { data: template } = await supabase.from("templates").select("id, slots").eq("id", input.templateId).maybeSingle();
  if (!template) return { ok: false, error: "テンプレートが見つかりません。" };
  const slots = slotsSchema.parse(template.slots);
  const params = parseEditorParams(input.params, slots);

  // パラメータが参照する画像と、送られてきた画像一覧を突き合わせる
  const imagesById = new Map(input.images.map((img) => [img.id, img]));
  const referenced = new Map<string, (typeof input.images)[number]>();
  for (const slot of slots) {
    const p = params.slots[slot.key];
    if (p?.kind !== "print" || !p.imageId) continue;
    const image = imagesById.get(p.imageId);
    if (!image || image.slot !== slot.key) return { ok: false, error: "画像の情報が一致しません。ページを再読み込みしてください。" };
    referenced.set(image.id, image);
  }

  const { data: existing } = await supabase.from("works").select("id, status").eq("id", input.workId).maybeSingle();
  if (existing?.status === "suspended") {
    return { ok: false, error: "この作品は運営により公開停止されているため、保存できません。", code: "suspended" };
  }
  if (!existing) {
    const { count } = await supabase.from("works").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= MAX_WORKS_PER_USER) {
      return {
        ok: false,
        error: `保存できる作品は ${MAX_WORKS_PER_USER} 件までです。マイ作品から不要な作品を削除してください。`,
        code: "limit",
      };
    }
  }

  const { data: storedImages } = existing
    ? await supabase.from("work_images").select("id, storage_path").eq("work_id", input.workId)
    : { data: [] as { id: string; storage_path: string }[] };
  const storedIds = new Set((storedImages ?? []).map((i) => i.id));

  for (const image of referenced.values()) {
    if (storedIds.has(image.id)) continue;
    const problem = await verifyImage(supabase, workImagePath(userId, input.workId, image.id, image.ext));
    if (problem) return { ok: false, error: problem };
  }

  const thumbnailPath = workThumbnailPath(userId, input.workId);
  const row = {
    name: input.name,
    params,
    ...(input.hasThumbnail ? { thumbnail_path: thumbnailPath } : {}),
  };
  const { data: saved, error: saveError } = existing
    ? await supabase.from("works").update(row).eq("id", input.workId).select("updated_at").single()
    : await supabase
        .from("works")
        .insert({ id: input.workId, user_id: userId, template_id: input.templateId, ...row })
        .select("updated_at")
        .single();
  if (saveError || !saved) return { ok: false, error: "保存に失敗しました。時間をおいて再度お試しください。" };

  // 使われなくなった画像を消し、新しい画像を登録する
  const stale = (storedImages ?? []).filter((i) => !referenced.has(i.id));
  if (stale.length > 0) {
    await supabase.from("work_images").delete().in("id", stale.map((i) => i.id));
    await supabase.storage.from(WORK_IMAGES_BUCKET).remove(stale.map((i) => i.storage_path));
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
      })),
    );
    if (error) return { ok: false, error: "画像の登録に失敗しました。もう一度保存してください。" };
  }

  revalidatePath("/works");
  return { ok: true, workId: input.workId, savedImageIds: [...referenced.keys()], updatedAt: saved.updated_at };
}

async function removeFolder(supabase: Supabase, folder: string) {
  const { data } = await supabase.storage.from(WORK_IMAGES_BUCKET).list(folder, { limit: 1000 });
  const files = (data ?? []).filter((f) => f.id !== null).map((f) => `${folder}/${f.name}`);
  if (files.length > 0) await supabase.storage.from(WORK_IMAGES_BUCKET).remove(files);
}

export type WorkActionResult = { ok: true } | { ok: false; error: string };

export async function renameWork(workId: string, name: string): Promise<WorkActionResult> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return { ok: false, error: "作品名は1〜100文字で入力してください。" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("works").update({ name: trimmed }).eq("id", workId).select("id");
  if (error || !data?.length) return { ok: false, error: "名前を変更できませんでした。" };
  revalidatePath("/works");
  return { ok: true };
}

export async function deleteWork(workId: string): Promise<WorkActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "ログインしてください。" };
  const { data, error } = await supabase.from("works").delete().eq("id", workId).select("id");
  if (error || !data?.length) return { ok: false, error: "削除できませんでした。" };
  await removeFolder(supabase, workFolder(userId, workId));
  revalidatePath("/works");
  return { ok: true };
}

export async function duplicateWork(workId: string): Promise<WorkActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "ログインしてください。" };

  const { count } = await supabase.from("works").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_WORKS_PER_USER) {
    return { ok: false, error: `保存できる作品は ${MAX_WORKS_PER_USER} 件までです。不要な作品を削除してから複製してください。` };
  }

  const { data: source } = await supabase
    .from("works")
    .select("template_id, name, params, gimmicks, thumbnail_path, work_images(id, slot, storage_path, width, height)")
    .eq("id", workId)
    .maybeSingle();
  if (!source) return { ok: false, error: "作品が見つかりません。" };

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
      return { ok: false, error: "画像を複製できませんでした。" };
    }
    idMap.set(img.id, newImageId);
    newImages.push({ id: newImageId, work_id: newId, slot: img.slot, storage_path: path, width: img.width, height: img.height });
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
    name: `${source.name}（コピー）`.slice(0, 100),
    params,
    gimmicks: source.gimmicks,
    thumbnail_path: thumbnailPath,
  });
  if (error) {
    await removeFolder(supabase, workFolder(userId, newId));
    return { ok: false, error: "複製できませんでした。" };
  }
  if (newImages.length > 0) await supabase.from("work_images").insert(newImages);

  revalidatePath("/works");
  return { ok: true };
}
