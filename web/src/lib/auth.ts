import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function requireUser(nextPath: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

// オープンリダイレクトを防ぐため、同一サイト内の相対パスだけを許可する
export function safeNextPath(value: unknown, fallback = "/") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const authErrorMessages: Record<string, string> = {
  invalid_credentials: "メールアドレスまたはパスワードが正しくありません。",
  email_not_confirmed: "メールアドレスの確認が済んでいません。届いた確認メールのリンクを開いてください。",
  user_already_exists: "このメールアドレスはすでに登録されています。",
  email_exists: "このメールアドレスはすでに登録されています。",
  weak_password: "パスワードが弱すぎます。8文字以上で、推測されにくいものにしてください。",
  same_password: "新しいパスワードが現在のパスワードと同じです。",
  email_address_invalid: "メールアドレスの形式が正しくありません。",
  over_email_send_rate_limit: "メールの送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。",
  over_request_rate_limit: "操作が集中しています。しばらく時間をおいてから再度お試しください。",
  signup_disabled: "現在、新規登録を受け付けていません。",
  otp_expired: "リンクの有効期限が切れています。もう一度やり直してください。",
};

export function authErrorMessage(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return "エラーが発生しました。";
  return (error.code && authErrorMessages[error.code]) || "エラーが発生しました。時間をおいて再度お試しください。";
}
