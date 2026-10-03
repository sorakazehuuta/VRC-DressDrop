import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "../../auth/forms";

export const metadata: Metadata = { title: "パスワードの変更 | VRPrintLab" };

export default async function PasswordPage() {
  await requireUser("/account/password");
  return (
    <AuthLayout
      title="パスワードの変更"
      footer={
        <Link href="/account" className="underline">
          アカウント設定に戻る
        </Link>
      }
    >
      <PasswordForm />
    </AuthLayout>
  );
}
