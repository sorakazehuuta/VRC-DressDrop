"use client";

import { useActionState } from "react";
import { useCaptcha } from "@/components/captcha";
import { Button, Field, FormMessage } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import Link from "@/i18n/link";
import { requestPasswordReset, signIn, signInWithOAuth, signUp, updatePassword } from "./actions";
import { authMessages } from "./messages";

export function LoginForm({ next }: { next: string }) {
  const m = useMessages(authMessages);
  const [state, action, pending] = useActionState(signIn, null);
  const captcha = useCaptcha(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label={m.fields.email} name="email" type="email" autoComplete="email" required />
      <Field label={m.fields.password} name="password" type="password" autoComplete="current-password" required />
      {captcha.field}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending || !captcha.ready}>
        {pending ? m.buttons.loggingIn : m.buttons.login}
      </Button>
      <Link href="/forgot-password" className="text-center text-sm text-zinc-600 underline">
        {m.buttons.forgot}
      </Link>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const m = useMessages(authMessages);
  const [state, action, pending] = useActionState(signUp, null);
  const captcha = useCaptcha(state);
  if (state?.message) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage state={state} />
        <p className="text-sm leading-relaxed text-zinc-600">
          {m.signup.notReceived1}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline">
            {m.signup.notReceivedLogin}
          </Link>
          {m.signup.notReceivedOr}
          <Link href="/forgot-password" className="underline">
            {m.signup.notReceivedReset}
          </Link>
          {m.signup.notReceived2}
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label={m.fields.displayName} name="displayName" maxLength={50} autoComplete="nickname" hint={m.fields.displayNameHint} />
      <Field label={m.fields.email} name="email" type="email" autoComplete="email" required />
      <Field label={m.fields.password} name="password" type="password" autoComplete="new-password" minLength={8} required hint={m.fields.passwordHint} />
      <Field label={m.fields.passwordConfirm} name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required />
      {captcha.field}
      <FormMessage state={state} />
      <Button type="submit" variant="accent" disabled={pending || !captcha.ready}>
        {pending ? m.buttons.signingUp : m.buttons.signup}
      </Button>
    </form>
  );
}

export function OAuthButtons({ next }: { next: string }) {
  const m = useMessages(authMessages);
  return (
    <form action={signInWithOAuth} className="flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <Button type="submit" name="provider" value="google" variant="secondary">
        {m.buttons.google}
      </Button>
      <Button type="submit" name="provider" value="discord" variant="secondary">
        {m.buttons.discord}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const m = useMessages(authMessages);
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  const captcha = useCaptcha(state);
  if (state?.message) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label={m.fields.registeredEmail} name="email" type="email" autoComplete="email" required />
      {captcha.field}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending || !captcha.ready}>
        {pending ? m.buttons.sending : m.buttons.sendReset}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const m = useMessages(authMessages);
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label={m.fields.newPassword} name="password" type="password" autoComplete="new-password" minLength={8} required hint={m.fields.passwordHint} />
      <Field label={m.fields.newPasswordConfirm} name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? m.buttons.changing : m.buttons.changePassword}
      </Button>
    </form>
  );
}
