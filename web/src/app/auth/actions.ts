"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorMessage, safeNextPath, siteOrigin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string } | null;

const MIN_PASSWORD_LENGTH = 8;

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, "email");
  const password = formData.get("password");
  if (!email || typeof password !== "string" || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error) };

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, "email");
  const displayName = str(formData, "displayName");
  const password = formData.get("password");

  if (!email) return { error: "メールアドレスを入力してください。" };
  if (displayName.length > 50) return { error: "表示名は50文字以内で入力してください。" };
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。` };
  }
  if (password !== formData.get("passwordConfirm")) {
    return { error: "確認用のパスワードが一致しません。" };
  }

  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: displayName },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: authErrorMessage(error) };

  // メール確認が不要な設定ならそのままログイン状態になる
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }
  return {
    message: `${email} に確認メールを送信しました。メール内のリンクを開くと登録が完了します。`,
  };
}

export async function signInWithOAuth(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "discord") redirect("/login");

  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=oauth&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, "email");
  if (!email) return { error: "メールアドレスを入力してください。" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/account/password`,
  });
  // 登録の有無を推測されないよう、存在しないアドレスでも同じ案内を返す
  if (error && error.code !== "user_not_found") return { error: authErrorMessage(error) };
  return {
    message: `${email} が登録済みであれば、パスワード再設定用のメールを送信しました。メール内のリンクを開いてください。`,
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。` };
  }
  if (password !== formData.get("passwordConfirm")) {
    return { error: "確認用のパスワードが一致しません。" };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) redirect("/login?next=/account/password");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error) };
  return { message: "パスワードを変更しました。" };
}
