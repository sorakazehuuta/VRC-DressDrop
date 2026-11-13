import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authMessages } from "@/app/auth/messages";
import type { Locale } from "@/i18n/config";
import { pick } from "@/i18n/messages";
import { localized } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function requireUser(nextPath: string) {
  const user = await getCurrentUser();
  if (!user) redirect(await localized(`/login?next=${encodeURIComponent(nextPath)}`));
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

// 使い捨てメールアドレスの拒否（DB の hook_before_user_created が返す文言に含まれる目印）
export const DISPOSABLE_EMAIL_MARKER = "disposable_email_domain";

export function authErrorMessage(error: { code?: string; message?: string } | null | undefined, locale: Locale) {
  const m = pick(authMessages, locale);
  if (!error) return m.errorUnknown;
  if (error.message?.includes(DISPOSABLE_EMAIL_MARKER)) return m.disposableEmail;
  return (error.code && m.errorCodes[error.code]) || m.errorDefault;
}
