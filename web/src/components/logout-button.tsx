"use client";

import { useState, type ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { useMessages } from "@/i18n/client";
import { ConfirmDialog } from "./confirm-dialog";
import { commonMessages } from "./messages";
import { Button } from "./ui";

// 押すと確認ダイアログを出し、「ログアウトする」でログアウトする
export function LogoutButton({ className, children }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const m = useMessages(commonMessages).logout;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? m.button}
      </button>
      {open && (
        <ConfirmDialog title={m.title} onClose={() => setOpen(false)}>
          <p className="text-sm leading-relaxed text-zinc-600">{m.body}</p>
          <form action={signOut} className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {m.cancel}
            </Button>
            <Button type="submit" autoFocus>
              {m.confirm}
            </Button>
          </form>
        </ConfirmDialog>
      )}
    </>
  );
}
