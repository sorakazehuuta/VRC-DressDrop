import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { ForgotPasswordForm } from "../auth/forms";

export const metadata: Metadata = { title: "パスワードの再設定 | VRC-DressDrop" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="パスワードの再設定"
      footer={
        <Link href="/login" className="underline">
          ログイン画面に戻る
        </Link>
      }
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        登録したメールアドレスに、パスワード再設定用のリンクを送ります。
      </p>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
