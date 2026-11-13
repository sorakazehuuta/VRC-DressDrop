import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth-layout";
import Link from "@/i18n/link";
import { getMessages } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "../../auth/forms";
import { authMessages } from "../../auth/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(authMessages)).password.title} | VRPrintLab` };
}

export default async function PasswordPage() {
  await requireUser("/account/password");
  const m = (await getMessages(authMessages)).password;
  return (
    <AuthLayout
      title={m.title}
      footer={
        <Link href="/account" className="underline">
          {m.back}
        </Link>
      }
    >
      <PasswordForm />
    </AuthLayout>
  );
}
