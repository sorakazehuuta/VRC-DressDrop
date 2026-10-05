"use client";

import { useState, type ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { Button } from "./ui";

// 押すと確認ダイアログを出し、「ログアウトする」でログアウトする
export function LogoutButton({ className, children = "ログアウト" }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && (
        <ConfirmDialog title="ログアウトしますか？" onClose={() => setOpen(false)}>
          <p className="text-sm leading-relaxed text-zinc-600">保存していない編集内容がある場合は、先に保存してください。</p>
          <form action={signOut} className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" autoFocus>
              ログアウトする
            </Button>
          </form>
        </ConfirmDialog>
      )}
    </>
  );
}
