import type { ReactNode } from "react";
import { Card } from "./ui";

export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-center text-2xl font-bold">{title}</h1>
      <Card className="flex flex-col gap-6">{children}</Card>
      {footer && <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">{footer}</div>}
    </main>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      {children}
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
