"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/ui";
import { deleteAccount, updateDisplayName } from "./actions";

export function DisplayNameForm({ defaultValue }: { defaultValue: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="表示名" name="displayName" defaultValue={defaultValue} maxLength={50} autoComplete="nickname" />
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "保存中…" : "保存する"}
      </Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="確認のため「退会する」と入力してください" name="confirm" autoComplete="off" required />
      <FormMessage state={state} />
      <Button type="submit" variant="danger" disabled={pending} className="self-start">
        {pending ? "処理中…" : "退会する"}
      </Button>
    </form>
  );
}
