import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// Storage のファイルは、先に削除キュー（storage_deletions）に記録してから消す。
// 失敗した分はキューに残り、定期実行（/api/cron/storage-deletions）か管理画面から再試行する

type Admin = ReturnType<typeof createAdminClient>;

export type DeletionTarget = { bucket: string; path: string; prefix?: boolean };
export type DeletionReason = "work_deleted" | "image_replaced" | "snapshot_deleted" | "account_deleted";

const MAX_ATTEMPTS = 10;

// フォルダの下のファイルをすべて消す（Storage のフォルダは id を持たない）
async function removePrefix(admin: Admin, bucket: string, prefix: string) {
  for (;;) {
    const { data: entries, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;
    const files: string[] = [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) await removePrefix(admin, bucket, path);
      else files.push(path);
    }
    if (files.length === 0) return;
    const { error: removeError } = await admin.storage.from(bucket).remove(files);
    if (removeError) throw removeError;
    if (entries.length < 1000) return;
  }
}

// キューに記録する。記録できなければ例外（呼び出し側は DB の行を消さずに中止する）
export async function enqueueDeletions(targets: DeletionTarget[], userId: string | null, reason: DeletionReason) {
  if (targets.length === 0) return [] as string[];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("storage_deletions")
    .insert(targets.map((t) => ({ bucket: t.bucket, path: t.path, prefix: t.prefix ?? false, user_id: userId, reason })))
    .select("id");
  if (error || !data) throw new Error(`削除キューに記録できません: ${error?.message}`);
  return data.map((r) => r.id as string);
}

// ids を省略すると、未完了のものをまとめて再試行する。成功・失敗の件数を返す
export async function processDeletions(ids?: string[]) {
  const admin = createAdminClient();
  let query = admin
    .from("storage_deletions")
    .select("id, bucket, path, prefix, attempts")
    .is("done_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(200);
  if (ids) query = query.in("id", ids);
  const { data: rows } = await query;

  let done = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    let lastError: string | null = null;
    try {
      if (row.prefix) await removePrefix(admin, row.bucket, row.path);
      else {
        const { error } = await admin.storage.from(row.bucket).remove([row.path]);
        if (error) throw error;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    const now = new Date().toISOString();
    await admin
      .from("storage_deletions")
      .update({ attempts: row.attempts + 1, last_tried_at: now, last_error: lastError, done_at: lastError ? null : now })
      .eq("id", row.id);
    if (lastError) failed++;
    else done++;
  }
  return { done, failed };
}

// 記録してすぐ消す。消せなかった分はキューに残る
export async function deleteFiles(targets: DeletionTarget[], userId: string | null, reason: DeletionReason) {
  const ids = await enqueueDeletions(targets, userId, reason);
  if (ids.length) await processDeletions(ids);
}

// 記録したあとで DB の削除に失敗した場合に、記録を取り消す（まだ使われているファイルを消さないように）
export async function cancelDeletions(ids: string[]) {
  if (ids.length) await createAdminClient().from("storage_deletions").delete().in("id", ids).is("done_at", null);
}
