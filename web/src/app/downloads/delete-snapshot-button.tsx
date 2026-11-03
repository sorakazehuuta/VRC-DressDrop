"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui";
import { deleteSnapshot } from "./actions";

export function DeleteSnapshotButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={pending} className="cursor-pointer text-sm text-red-600 hover:underline disabled:opacity-50">
        {pending ? "削除中…" : "この版の控えを削除"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
      {open && (
        <ConfirmDialog title="この版の控えを削除しますか？" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-600">
            <p>この版のパッケージ、元画像のコピー、プレビュー画像を削除します。元に戻せません。</p>
            <p className="font-semibold text-red-700">削除すると、ダウンロード履歴からこの版を再ダウンロードできなくなります。</p>
            <p>購入の記録（日時・使ったトークン数・編集内容）は残ります。</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              キャンセル
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
              削除する
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
