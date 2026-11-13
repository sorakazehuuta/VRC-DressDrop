"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale, localized } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { authErrorMessage, safeNextPath, siteOrigin } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import { authMessages } from "./messages";

export type FormState = { error?: string; message?: string } | null;

const MIN_PASSWORD_LENGTH = 8;

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// Turnstile のトークン（components/captcha.tsx）。検証は Supabase Auth が行う
function captchaToken(formData: FormData) {
  return str(formData, "captchaToken") || undefined;
}

// 表示している言語の文言と、言語付きの戻り先（英語なら /en/...）
async function context(formData?: FormData) {
  const locale = await getLocale();
  const next = formData ? await localized(safeNextPath(formData.get("next"))) : "/";
  return { locale, m: pick(authMessages, locale), next };
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, m, next } = await context(formData);
  const email = str(formData, "email");
  const password = formData.get("password");
  if (!email || typeof password !== "string" || !password) {
    return { error: m.validation.emailAndPassword };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken(formData) } });
  if (error) return { error: authErrorMessage(error, locale) };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, m, next } = await context(formData);
  const email = str(formData, "email");
  const displayName = str(formData, "displayName");
  const password = formData.get("password");

  if (!email) return { error: m.validation.email };
  if (displayName.length > 50) return { error: m.validation.displayNameLength };
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: m.validation.passwordLength(MIN_PASSWORD_LENGTH) };
  }
  if (password !== formData.get("passwordConfirm")) {
    return { error: m.validation.passwordMismatch };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // 同意した規約の版。新規登録のトリガーが profiles に記録する
      data: { name: displayName, terms_version: TERMS_VERSION },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      captchaToken: captchaToken(formData),
    },
  });
  if (error) return { error: authErrorMessage(error, locale) };

  // メール確認が不要な設定ならそのままログイン状態になる
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }
  // 登録済みのアドレスでも Supabase はエラーを返さずメールも送らない（登録の有無を推測されないため）。
  // どちらの場合にも当てはまる案内にし、届かないときの案内はフォーム側（SignupForm）で出す
  return { message: m.signup.sent(email) };
}

export async function signInWithOAuth(formData: FormData) {
  const { next } = await context(formData);
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "discord") redirect(await localized("/login"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(await localized(`/login?error=oauth&next=${encodeURIComponent(next)}`));
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(await localized("/"));
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, m } = await context();
  const email = str(formData, "email");
  if (!email) return { error: m.validation.email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(await localized("/account/password"))}`,
    captchaToken: captchaToken(formData),
  });
  // 登録の有無を推測されないよう、存在しないアドレスでも同じ案内を返す
  if (error && error.code !== "user_not_found") return { error: authErrorMessage(error, locale) };
  return { message: m.forgot.sent(email) };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, m } = await context();
  const password = formData.get("password");
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: m.validation.passwordLength(MIN_PASSWORD_LENGTH) };
  }
  if (password !== formData.get("passwordConfirm")) {
    return { error: m.validation.passwordMismatch };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect(await localized("/login?next=/account/password"));

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error, locale) };
  return { message: m.password.changed };
}
