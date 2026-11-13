import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout, Divider, TermsNotice } from "@/components/auth-layout";
import { FormMessage } from "@/components/ui";
import Link from "@/i18n/link";
import { getMessages, localized } from "@/i18n/server";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm, OAuthButtons } from "../auth/forms";
import { authMessages } from "../auth/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(authMessages)).login.title} | VRPrintLab` };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/");
  if (await getCurrentUser()) redirect(await localized(next));

  const m = await getMessages(authMessages);
  const errorMessages: Record<string, string> = { ...m.login.errors, disposable: m.disposableEmail };
  const error = typeof params.error === "string" ? errorMessages[params.error] : undefined;

  return (
    <AuthLayout
      title={m.login.title}
      footer={
        <>
          {m.login.noAccount}{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold underline">
            {m.login.signupLink}
          </Link>
        </>
      }
    >
      {error && <FormMessage state={{ error }} />}
      <OAuthButtons next={next} />
      <Divider>{m.login.orEmail}</Divider>
      <LoginForm next={next} />
      <TermsNotice action={m.login.termsAction} />
    </AuthLayout>
  );
}
