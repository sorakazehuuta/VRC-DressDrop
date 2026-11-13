"use client";

import { useState, useTransition } from "react";
import { purchaseDownloadUrl } from "@/app/works/download";
import { Button } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { saveFileFromUrl } from "@/lib/save-file";
import { downloadsMessages } from "./messages";

export function RedownloadButton({ purchaseId }: { purchaseId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const m = useMessages(downloadsMessages);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await purchaseDownloadUrl(purchaseId);
            if (!result.ok) return setError(result.error);
            await saveFileFromUrl(result.url, result.filename);
          })
        }
      >
        {pending ? m.preparing : m.download}
      </Button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
