"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { deleteSnapshot } from "./actions";
import { downloadsMessages } from "./messages";

export function DeleteSnapshotButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const m = useMessages(downloadsMessages).deleteSnapshot;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={pending} className="cursor-pointer text-sm text-red-600 hover:underline disabled:opacity-50">
        {pending ? m.deleting : m.button}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
      {open && (
        <ConfirmDialog title={m.title} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-600">
            <p>{m.body1}</p>
            <p className="font-semibold text-red-700">{m.body2}</p>
            <p>{m.body3}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {m.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setOpen(false);
                setError(null);
                startTransition(async () => {
                  const result = await deleteSnapshot(purchaseId);
                  if (!result.ok) setError(result.error);
                  else router.refresh();
                });
              }}
            >
              {m.confirm}
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
