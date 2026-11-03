"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { startCheckout } from "./actions";

export function BuyButton({ packId, disabled }: { packId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(startCheckout, null);
  return (
    <form action={action} className="mt-auto flex flex-col gap-1">
      <input type="hidden" name="packId" value={packId} />
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "決済画面へ移動中…" : "購入する"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
