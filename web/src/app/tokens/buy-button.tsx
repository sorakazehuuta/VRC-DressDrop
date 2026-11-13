"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { startCheckout } from "./actions";
import { tokensMessages } from "./messages";

export function BuyButton({ packId, disabled }: { packId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(startCheckout, null);
  const m = useMessages(tokensMessages).buy;
  return (
    <form action={action} className="mt-auto flex flex-col gap-1">
      <input type="hidden" name="packId" value={packId} />
      <Button type="submit" variant="accent" className="py-3 text-base" disabled={disabled || pending}>
        {pending ? m.redirecting : m.button}
      </Button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
