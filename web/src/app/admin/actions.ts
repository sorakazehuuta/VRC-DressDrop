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
