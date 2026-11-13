import type { ReactNode } from "react";
import Link from "@/i18n/link";
import { getMessages } from "@/i18n/server";
import { commonMessages } from "./messages";
import { Card } from "./ui";

export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-center text-[1.75rem] font-extrabold text-brand">{title}</h1>
      <Card className="flex flex-col gap-6">{children}</Card>
      {footer && <div className="text-center text-sm text-zinc-600">{footer}</div>}
    </main>
  );
}

// 登録・ログインの操作で同意したものとして、規約の版を記録する（auth/actions.ts と auth/callback）
// action: 「ログイン・登録」など（英語では "logging in or signing up" のように動名詞で渡す）
export async function TermsNotice({ action }: { action: string }) {
  const m = (await getMessages(commonMessages)).terms;
  return (
    <p className="text-xs leading-relaxed text-zinc-500">
      {m.before(action)}
      <Link href="/terms" className="underline" target="_blank">
        {m.terms}
      </Link>
      {m.and}
      <Link href="/privacy" className="underline" target="_blank">
        {m.privacy}
      </Link>
      {m.after}
    </p>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <span className="h-px flex-1 bg-zinc-200" />
      {children}
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}
