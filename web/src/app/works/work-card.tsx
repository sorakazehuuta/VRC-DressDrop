"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui";
import { useLocale, useMessages } from "@/i18n/client";
import { formatDateTime } from "@/i18n/format";
import Link from "@/i18n/link";
import { deleteWork, duplicateWork, renameWork, type WorkActionResult } from "./actions";
import { worksMessages } from "./messages";

export type WorkCardData = {
  id: string;
  name: string;
  suspended: boolean;
  updatedAt: string;
  templateName: string;
  editUrl: string;
  thumbnailUrl: string | null;
};

export function WorkCard({ work, canDuplicate }: { work: WorkCardData; canDuplicate: boolean }) {
  const locale = useLocale();
  const m = useMessages(worksMessages).card;
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(work.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<WorkActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else after?.();
    });
  }

  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white ${pending ? "opacity-60" : ""}`}>
      <Link href={work.editUrl} className="relative block aspect-[4/3] bg-zinc-100">
        {work.thumbnailUrl ? (
          // 署名付き URL は1時間で切れるため、最適化キャッシュを通さず直接表示する
          // eslint-disable-next-line @next/next/no-img-element
          <img src={work.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-zinc-400">{m.noPreview}</span>
        )}
        {work.suspended && (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{m.suspended}</span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renameWork(work.id, name), () => setEditing(false));
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              aria-label={m.name}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={pending} className="text-sm font-semibold text-accent-dark">
              {m.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setName(work.name);
                setEditing(false);
              }}
              className="text-sm text-zinc-500"
            >
              {m.cancelRename}
            </button>
          </form>
        ) : (
          <Link href={work.editUrl} className="font-semibold text-brand hover:underline">
            {work.name}
          </Link>
        )}
        <p className="text-xs text-zinc-500">
          {m.updated(work.templateName, formatDateTime(locale, work.updatedAt))}
        </p>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm">
          <Link href={work.editUrl} className="font-semibold text-accent-dark hover:underline">
            {m.edit}
          </Link>
          <button type="button" disabled={pending} onClick={() => setEditing(true)} className="cursor-pointer text-zinc-600 hover:underline">
            {m.rename}
          </button>
          <button
            type="button"
            disabled={pending || !canDuplicate}
            title={canDuplicate ? undefined : m.limitReached}
            onClick={() => run(() => duplicateWork(work.id))}
            className="cursor-pointer text-zinc-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            {m.duplicate}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingDelete(true)}
            className="cursor-pointer text-red-600 hover:underline"
          >
            {m.delete}
          </button>
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmDialog title={m.deleteTitle(work.name)} onClose={() => setConfirmingDelete(false)}>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-600">
            <p>{m.deleteBody}</p>
            <p>
              {m.keep1}
              <Link href="/downloads" className="underline">
                {m.keepLink}
              </Link>
              {m.keep2}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmingDelete(false)}>
              {m.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirmingDelete(false);
                run(() => deleteWork(work.id));
              }}
            >
              {m.confirmDelete}
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </article>
  );
}
