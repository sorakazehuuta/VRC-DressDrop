"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/ui";
import { adjustTokens, retryStorageDeletions } from "./actions";

export function AdjustTokensForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(adjustTokens, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <Field label="トークン数（増やすなら正、減らすなら負）" name="delta" type="number" step={1} min={-1000} max={1000} required />
      <Field label="理由（必須。履歴に残ります）" name="reason" required maxLength={200} placeholder="例: 二重消費の補填（問い合わせ #12）" />
      <Field label="関係する購入・支払いの ID（任意）" name="refId" autoComplete="off" />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "処理中…" : "調整する"}
      </Button>
    </form>
  );
}

export function RetryDeletionsForm() {
  const [state, action, pending] = useActionState(retryStorageDeletions, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "再試行中…" : "未完了の削除を再試行"}
      </Button>
    </form>
  );
}
