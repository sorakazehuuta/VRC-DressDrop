"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { deleteAccount, updateDisplayName } from "./actions";
import { accountMessages } from "./messages";

export function DisplayNameForm({ defaultValue }: { defaultValue: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  const m = useMessages(accountMessages).profile;
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={m.displayName} name="displayName" defaultValue={defaultValue} maxLength={50} autoComplete="nickname" />
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? m.saving : m.save}
      </Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, null);
  const m = useMessages(accountMessages).delete;
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={m.confirmLabel} name="confirm" autoComplete="off" required />
      <FormMessage state={state} />
      <Button type="submit" variant="danger" disabled={pending} className="self-start">
        {pending ? m.processing : m.submit}
      </Button>
    </form>
  );
}
