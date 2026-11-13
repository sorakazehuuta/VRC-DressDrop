import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout, Divider, TermsNotice } from "@/components/auth-layout";
import { FormMessage } from "@/components/ui";
import { DISPOSABLE_EMAIL_MESSAGE, getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm, OAuthButtons } from "../auth/forms";

export const metadata: Metadata = { title: "ログイン | VRPrintLab" };

const errorMessages: Record<string, string> = {
  callback: "ログインできませんでした。リンクの有効期限が切れているか、別のブラウザで開いた可能性があります。もう一度お試しください。",
  oauth: "外部サービスでのログインを開始できませんでした。時間をおいて再度お試しください。",
  disposable: DISPOSABLE_EMAIL_MESSAGE,
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/");
  if (await getCurrentUser()) redirect(next);

  const error = typeof params.error === "string" ? errorMessages[params.error] : undefined;

  return (
    <AuthLayout
      title="ログイン"
      footer={
        <>
          アカウントをお持ちでない方は{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold underline">
            新規登録
          </Link>
        </>
      }
    >
      {error && <FormMessage state={{ error }} />}
      <OAuthButtons next={next} />
      <Divider>またはメールアドレスで</Divider>
      <LoginForm next={next} />
      <TermsNotice action="ログイン・登録" />
    </AuthLayout>
  );
}
