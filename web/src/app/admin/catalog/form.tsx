"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button, FormMessage } from "@/components/ui";

type Row = { id: string; slug: string; name: string; token_cost: number; is_public: boolean };

export function CatalogForm({
  rows,
  action,
  previewBase,
  saveLabel,
}: {
  rows: Row[];
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  previewBase?: string;
  saveLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-3 border-t border-zinc-100 py-2 text-sm">
          <span className="min-w-40 flex-1">
            {row.name} <span className="font-mono text-xs text-zinc-400">{row.slug}</span>
            {previewBase && (
              <Link href={`${previewBase}/${row.slug}`} className="ml-2 text-xs underline">
                エディタで確認
              </Link>
            )}
          </span>
          <label className="flex items-center gap-1">
            <input name={`tokenCost:${row.id}`} type="number" required min={0} max={100} step={1} defaultValue={row.token_cost} className="w-16 rounded border border-zinc-300 px-2 py-1 text-right" />
            トークン
          </label>
          <label className="flex items-center gap-1">
            <input name={`isPublic:${row.id}`} type="checkbox" defaultChecked={row.is_public} />
            公開
          </label>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "保存中…" : saveLabel}
        </Button>
      </div>
    </form>
  );
}
