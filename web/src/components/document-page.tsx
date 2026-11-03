import type { ReactNode } from "react";

export function DocumentPage({ children, notice }: { children: ReactNode; notice?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-10">
      {notice && <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>}
      {children}
    </main>
  );
}
