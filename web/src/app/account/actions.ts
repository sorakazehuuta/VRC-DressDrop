"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/auth/actions";
import { getMessages, localized } from "@/i18n/server";
import { stripe } from "@/lib/payments/stripe";
import { cancelDeletions, enqueueDeletions, processDeletions } from "@/lib/storage-deletions";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { accountMessages } from "./messages";

const WORK_IMAGES_BUCKET = "work-images";
const PACKAGES_BUCKET = "packages";

export async function updateDisplayName(_prev: FormState, formData: FormData): Promise<FormState> {
  const m = await getMessages(accountMessages);
  const raw = formData.get("displayName");
  const displayName = typeof raw === "string" ? raw.trim() : "";
  if (displayName.length > 50) return { error: m.profile.tooLong };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect(await localized("/login?next=/account"));

  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", claims.claims.sub);
  if (error) return { error: m.errors.saveFailed };

  revalidatePath("/", "layout");
  return { message: m.profile.saved };
}

// 退会: 作品・画像・購入した版の控え・残っているトークンを消し、ログインできなくする。
// 支払い・トークンの履歴・ダウンロードの記録（画像とパッケージを除く）は取引の記録として残す（外部キーを外してある）
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const m = await getMessages(accountMessages);
  // 確認の言葉は表示している言語のもの（日本語は「退会する」、英語は DELETE）
  if (String(formData.get("confirm") ?? "").trim() !== m.delete.confirmWord) {
    return { error: m.delete.confirmError };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect(await localized("/login?next=/account"));
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
      else if (session.status === "complete") return { error: m.errors.paymentProcessing };
    } catch {
      return { error: m.errors.paymentCheckFailed };
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
    return { error: m.errors.deleteFailed };
  }

  const { error: prepareError } = await admin.rpc("prepare_account_deletion", { p_user_id: userId });
  if (prepareError) {
    await cancelDeletions(deletionIds);
    if (prepareError.message.includes("payment_pending")) {
      return { error: m.errors.konbiniPending };
    }
    return { error: m.errors.deleteFailed };
  }

  // 作品などは auth.users の削除に連動して消える（on delete cascade）
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    // 作品の画像は残す。控えはすでに削除済みの扱いにしたので、そのまま消す
    const [workImagesId, packagesId] = deletionIds;
    await cancelDeletions([workImagesId]);
    await processDeletions([packagesId]);
    return { error: m.errors.deleteFailed };
  }
  // 消せなかったファイルはキューに残り、あとで再試行する
  await processDeletions(deletionIds);

  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect(await localized("/?deleted=1"));
}
