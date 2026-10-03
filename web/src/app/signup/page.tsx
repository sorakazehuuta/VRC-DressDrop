import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout, Divider } from "@/components/auth-layout";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { OAuthButtons, SignupForm } from "../auth/forms";

export const metadata: Metadata = { title: "新規登録 | VRC-DressDrop" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/account");
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthLayout
      title="新規登録"
      footer={
        <>
          すでにアカウントをお持ちの方は{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold underline">
            ログイン
          </Link>
        </>
      }
    >
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        今なら登録するだけで <strong>3トークン</strong> をプレゼント。すぐにモデルをダウンロードできます。
      </p>
      <OAuthButtons next={next} />
      <Divider>またはメールアドレスで</Divider>
      <SignupForm next={next} />
    </AuthLayout>
  );
}
