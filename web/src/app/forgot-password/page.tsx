import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth-layout";
import Link from "@/i18n/link";
import { getMessages } from "@/i18n/server";
import { ForgotPasswordForm } from "../auth/forms";
import { authMessages } from "../auth/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(authMessages)).forgot.title} | VRPrintLab` };
}

export default async function ForgotPasswordPage() {
  const m = (await getMessages(authMessages)).forgot;
  return (
    <AuthLayout
      title={m.title}
      footer={
        <Link href="/login" className="underline">
          {m.back}
        </Link>
      }
    >
      <p className="text-sm text-zinc-600">
        {m.lead}
      </p>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
