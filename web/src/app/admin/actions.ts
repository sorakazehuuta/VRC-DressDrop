"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/auth/actions";
import { requireAdmin } from "@/lib/admin";
import { processDeletions } from "@/lib/storage-deletions";
import { createAdminClient } from "@/lib/supabase/server";

const adjustErrors: Record<string, string> = {
  invalid_delta: "調整するトークン数は 0 以外、±1000 以内で入力してください。",
  reason_required: "理由を入力してください。",
  insufficient_tokens: "減らすトークンが残高より多いです。",
  user_not_found: "ユーザーが見つかりません（退会済みの可能性があります）。",
  not_admin: "管理者だけが操作できます。",
};

// トークンの手動調整（二重消費・不具合の補填など）。理由は必須で、履歴に操作した管理者と一緒に残る
export async function adjustTokens(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") ?? "").trim();
  const refRaw = String(formData.get("refId") ?? "").trim();
  if (!Number.isInteger(delta)) return { error: "トークン数は整数で入力してください。" };
  if (refRaw && !/^[0-9a-f-]{36}$/i.test(refRaw)) return { error: "関係する ID は、購入または支払いの ID（UUID）を入力してください。" };

  const { error } = await createAdminClient().rpc("admin_adjust_tokens", {
    p_admin_id: adminUser.id,
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
    p_ref_id: refRaw || null,
  });
  if (error) {
    const code = Object.keys(adjustErrors).find((k) => error.message.includes(k));
    return { error: code ? adjustErrors[code] : `調整できませんでした: ${error.message}` };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { message: `${delta > 0 ? "+" : ""}${delta} トークンを調整しました。` };
}

export async function retryStorageDeletions(): Promise<FormState> {
  await requireAdmin();
  const { done, failed } = await processDeletions();
  revalidatePath("/admin");
  return failed ? { error: `${done} 件を削除、${failed} 件は失敗しました。` } : { message: `${done} 件を削除しました。` };
}

// ===== 停止・設定の変更（どれも admin_actions に記録する） =====

async function logAction(adminId: string, action: string, targetId: string, note: string | null) {
  await createAdminClient().from("admin_actions").insert({ admin_id: adminId, action, target_id: targetId, note });
}

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// アカウントの停止・再開。停止中は購入・ダウンロード・作品の保存ができない
export async function setUserStatus(formData: FormData) {
  const adminUser = await requireAdmin();
  const userId = field(formData, "userId");
  const status = field(formData, "status") === "suspended" ? "suspended" : "active";
  if (userId === adminUser.id) return;
  await createAdminClient().from("profiles").update({ status }).eq("id", userId);
  await logAction(adminUser.id, status === "suspended" ? "suspend_user" : "restore_user", userId, field(formData, "note") || null);
  revalidatePath(`/admin/users/${userId}`);
}

// 作品の公開停止・再開。停止中の作品は編集・ダウンロードできない
export async function setWorkStatus(formData: FormData) {
  const adminUser = await requireAdmin();
  const workId = field(formData, "workId");
  const status = field(formData, "status") === "suspended" ? "suspended" : "active";
  await createAdminClient().from("works").update({ status }).eq("id", workId);
  await logAction(adminUser.id, status === "suspended" ? "suspend_work" : "restore_work", workId, field(formData, "note") || null);
  revalidatePath("/admin", "layout");
}

// 購入した版の停止・再開。停止中の版は再ダウンロードできない
export async function setPurchaseSuspended(formData: FormData) {
  const adminUser = await requireAdmin();
  const purchaseId = field(formData, "purchaseId");
  const suspend = field(formData, "suspend") === "1";
  await createAdminClient()
    .from("purchases")
    .update({ suspended_at: suspend ? new Date().toISOString() : null })
    .eq("id", purchaseId);
  await logAction(adminUser.id, suspend ? "suspend_purchase" : "restore_purchase", purchaseId, field(formData, "note") || null);
  revalidatePath("/admin", "layout");
}

const costSchema = (raw: string) => {
  const n = Number(raw);
  return raw !== "" && Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
};

// トークン数・公開状態をまとめて保存する（同期コマンドより DB の値が優先される）。変わった行だけ更新して記録に残す
async function saveCatalog(table: "templates" | "gimmicks", formData: FormData): Promise<FormState> {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from(table).select("id, token_cost, is_public");
  if (error) return { error: `読み込めませんでした: ${error.message}` };

  const changes: { id: string; tokenCost: number; isPublic: boolean }[] = [];
  for (const row of rows) {
    const raw = formData.get(`tokenCost:${row.id}`);
    if (raw === null) continue; // 画面を開いたあとに追加された行
    const tokenCost = costSchema(String(raw).trim());
    if (tokenCost === null) return { error: "トークン数は 0〜100 の整数で入力してください。保存していません。" };
    const isPublic = formData.get(`isPublic:${row.id}`) === "on";
    if (tokenCost !== row.token_cost || isPublic !== row.is_public) changes.push({ id: row.id, tokenCost, isPublic });
  }
  if (!changes.length) return { message: "変更はありません。" };

  const action = table === "templates" ? "update_template" : "update_gimmick";
  let saved = 0;
  for (const c of changes) {
    const { error: updateError } = await admin.from(table).update({ token_cost: c.tokenCost, is_public: c.isPublic }).eq("id", c.id);
    if (updateError) {
      revalidatePath("/", "layout");
      return { error: `${changes.length} 件のうち ${saved} 件まで保存して失敗しました: ${updateError.message}` };
    }
    await logAction(adminUser.id, action, c.id, `token_cost=${c.tokenCost} is_public=${c.isPublic}`);
    saved++;
  }
  revalidatePath("/", "layout");
  return { message: `${saved} 件を保存しました。` };
}

export async function updateTemplates(_prev: FormState, formData: FormData) {
  return saveCatalog("templates", formData);
}

export async function updateGimmicks(_prev: FormState, formData: FormData) {
  return saveCatalog("gimmicks", formData);
}
