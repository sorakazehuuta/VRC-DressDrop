"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/auth/actions";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const WORK_IMAGES_BUCKET = "work-images";

export async function updateDisplayName(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formData.get("displayName");
  const displayName = typeof raw === "string" ? raw.trim() : "";
  if (displayName.length > 50) return { error: "表示名は50文字以内で入力してください。" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect("/login?next=/account");

  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", claims.claims.sub);
  if (error) return { error: "保存できませんでした。時間をおいて再度お試しください。" };

  revalidatePath("/", "layout");
  return { message: "表示名を保存しました。" };
}

async function removeStorageFolder(admin: ReturnType<typeof createAdminClient>, prefix: string) {
  const { data: entries, error } = await admin.storage.from(WORK_IMAGES_BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;

  const files: string[] = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    // フォルダは id を持たない
    if (entry.id === null) await removeStorageFolder(admin, path);
    else files.push(path);
  }
  if (files.length > 0) {
    const { error: removeError } = await admin.storage.from(WORK_IMAGES_BUCKET).remove(files);
    if (removeError) throw removeError;
  }
}

export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "退会する") {
    return { error: "確認のため「退会する」と入力してください。" };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect("/login?next=/account");
  const userId = claims.claims.sub;

  const admin = createAdminClient();
  try {
    await removeStorageFolder(admin, userId);
  } catch {
    return { error: "アップロード画像を削除できませんでした。時間をおいて再度お試しください。" };
  }

  // DB 上のデータは auth.users の削除に連動して消える（on delete cascade）
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: "退会処理に失敗しました。時間をおいて再度お試しください。" };

  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}
