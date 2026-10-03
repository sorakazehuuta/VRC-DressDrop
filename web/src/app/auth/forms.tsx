"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/ui";
import { requestPasswordReset, signIn, signInWithOAuth, signUp, updatePassword } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="メールアドレス" name="email" type="email" autoComplete="email" required />
      <Field label="パスワード" name="password" type="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </Button>
      <Link href="/forgot-password" className="text-center text-sm text-zinc-600 underline">
        パスワードを忘れた方
      </Link>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, null);
  if (state?.message) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="表示名" name="displayName" maxLength={50} autoComplete="nickname" hint="あとから変更できます" />
      <Field label="メールアドレス" name="email" type="email" autoComplete="email" required />
      <Field
        label="パスワード"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="8文字以上"
      />
      <Field label="パスワード（確認）" name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "登録中…" : "登録する"}
      </Button>
    </form>
  );
}

export function OAuthButtons({ next }: { next: string }) {
  return (
    <form action={signInWithOAuth} className="flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <Button type="submit" name="provider" value="google" variant="secondary">
        Google で続ける
      </Button>
      <Button type="submit" name="provider" value="discord" variant="secondary">
        Discord で続ける
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  if (state?.message) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="登録したメールアドレス" name="email" type="email" autoComplete="email" required />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "送信中…" : "再設定メールを送る"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="新しいパスワード" name="password" type="password" autoComplete="new-password" minLength={8} required hint="8文字以上" />
      <Field label="新しいパスワード（確認）" name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "変更中…" : "パスワードを変更する"}
      </Button>
    </form>
  );
}
