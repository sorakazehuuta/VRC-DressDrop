import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// 管理者（profiles.is_admin）でなければ 404 にする（管理画面があること自体を見せない）
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { data } = await createAdminClient().from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!data?.is_admin) notFound();
  return user;
}

// 管理画面で見る、あるユーザーの残高（有効なトークンの合計 - マイナス残高）
export async function balanceOfUser(userId: string) {
  const admin = createAdminClient();
  const [{ data: lots }, { data: profile }] = await Promise.all([
    admin.from("token_lots").select("remaining").eq("user_id", userId).gt("remaining", 0).gt("expires_at", new Date().toISOString()),
    admin.from("profiles").select("token_debt").eq("id", userId).maybeSingle(),
  ]);
  return (lots ?? []).reduce((sum, l) => sum + l.remaining, 0) - (profile?.token_debt ?? 0);
}
