"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/auth/actions";
import { stripe } from "@/lib/payments/stripe";
import { cancelDeletions, enqueueDeletions, processDeletions } from "@/lib/storage-deletions";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const WORK_IMAGES_BUCKET = "work-images";
const PACKAGES_BUCKET = "packages";

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

// 退会: 作品・画像・購入した版の控え・残っているトークンを消し、ログインできなくする。
// 支払い・トークンの履歴・ダウンロードの記録（画像とパッケージを除く）は取引の記録として残す（外部キーを外してある）
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "退会する") {
    return { error: "確認のため「退会する」と入力してください。" };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect("/login?next=/account");
  const userId = claims.claims.sub;
  const admin = createAdminClient();

  // 開いたままの決済画面を無効にする（退会後に支払われるのを防ぐ）
  const { data: openPayments } = await admin
    .from("payments")
    .select("stripe_checkout_session_id")
    .eq("user_id", userId)
    .eq("status", "created")
    .not("stripe_checkout_session_id", "is", null);
  for (const p of openPayments ?? []) {
    try {
      const session = await stripe().checkout.sessions.retrieve(p.stripe_checkout_session_id as string);
      if (session.status === "open") await stripe().checkout.sessions.expire(session.id);
      else if (session.status === "complete") return { error: "処理中の支払いがあります。支払いの反映を待ってから、もう一度お試しください。" };
    } catch {
      return { error: "支払いの状態を確認できませんでした。時間をおいて再度お試しください。" };
    }
  }

  let deletionIds: string[];
  try {
    deletionIds = await enqueueDeletions(
      [
        { bucket: WORK_IMAGES_BUCKET, path: userId, prefix: true },
        { bucket: PACKAGES_BUCKET, path: userId, prefix: true },
      ],
      userId,
      "account_deleted",
    );
  } catch {
    return { error: "退会処理に失敗しました。時間をおいて再度お試しください。" };
  }

  const { error: prepareError } = await admin.rpc("prepare_account_deletion", { p_user_id: userId });
  if (prepareError) {
    await cancelDeletions(deletionIds);
    if (prepareError.message.includes("payment_pending")) {
      return { error: "コンビニ払いの支払い待ちがあるため、退会できません。支払うか、支払い期限が過ぎてからもう一度お試しください。" };
    }
    return { error: "退会処理に失敗しました。時間をおいて再度お試しください。" };
  }

  // 作品などは auth.users の削除に連動して消える（on delete cascade）
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    // 作品の画像は残す。控えはすでに削除済みの扱いにしたので、そのまま消す
    const [workImagesId, packagesId] = deletionIds;
    await cancelDeletions([workImagesId]);
    await processDeletions([packagesId]);
    return { error: "退会処理に失敗しました。時間をおいて再度お試しください。" };
  }
  // 消せなかったファイルはキューに残り、あとで再試行する
  await processDeletions(deletionIds);

  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}
