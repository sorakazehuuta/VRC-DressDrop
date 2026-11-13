import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout, Divider, TermsNotice } from "@/components/auth-layout";
import Link from "@/i18n/link";
import { getMessages, localized } from "@/i18n/server";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { OAuthButtons, SignupForm } from "../auth/forms";
import { authMessages } from "../auth/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(authMessages)).signup.title} | VRPrintLab` };
}

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/");
  if (await getCurrentUser()) redirect(await localized(next));
  const m = await getMessages(authMessages);

  return (
    <AuthLayout
      title={m.signup.title}
      footer={
        <>
          {m.signup.hasAccount}{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold underline">
            {m.signup.loginLink}
          </Link>
        </>
      }
    >
      <p className="rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-brand">
        {m.signup.bonus1}
        <strong className="text-accent-dark">{m.signup.bonusTokens}</strong>
        {m.signup.bonus2}
      </p>
      <OAuthButtons next={next} />
      <Divider>{m.login.orEmail}</Divider>
      <SignupForm next={next} />
      <TermsNotice action={m.signup.termsAction} />
    </AuthLayout>
  );
}
