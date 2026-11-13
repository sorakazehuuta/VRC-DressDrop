"use server";

import { revalidatePath } from "next/cache";
import { cancelDeletions, enqueueDeletions, processDeletions } from "@/lib/storage-deletions";
import { getMessages } from "@/i18n/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { downloadsMessages } from "./messages";

const PACKAGES_BUCKET = "packages";

// 購入した版の控え（パッケージ・元画像のコピー・サムネイル）を削除する。
// 購入の記録（日時・使ったトークン数・編集内容）は残す。控えを消した版はダウンロード履歴から再ダウンロードできない
export async function deleteSnapshot(purchaseId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = (await getMessages(downloadsMessages)).errors;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: m.login };

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, package_path, snapshot")
    .eq("id", purchaseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!purchase) return { ok: false, error: m.notFound };

  // 控えのファイルは "<user_id>/<purchase_id>/..." と "<user_id>/<purchase_id>.unitypackage"（作り直した場合は別名）
  const targets = [
    { bucket: PACKAGES_BUCKET, path: `${userId}/${purchase.id}`, prefix: true },
    ...(purchase.package_path ? [{ bucket: PACKAGES_BUCKET, path: purchase.package_path }] : []),
  ];
  let deletionIds: string[];
  try {
    deletionIds = await enqueueDeletions(targets, userId, "snapshot_deleted");
  } catch {
    return { ok: false, error: m.deleteFailed };
  }

  const snapshot = purchase.snapshot && typeof purchase.snapshot === "object" ? { ...(purchase.snapshot as Record<string, unknown>) } : null;
  if (snapshot) delete snapshot.images;
  const { error } = await createAdminClient()
    .from("purchases")
    .update({ package_path: null, thumbnail_path: null, snapshot, snapshot_deleted_at: new Date().toISOString() })
    .eq("id", purchase.id);
  if (error) {
    await cancelDeletions(deletionIds);
    return { ok: false, error: m.deleteFailed };
  }
  await processDeletions(deletionIds);

  revalidatePath("/downloads");
  revalidatePath(`/downloads/${purchase.id}`);
  return { ok: true };
}
