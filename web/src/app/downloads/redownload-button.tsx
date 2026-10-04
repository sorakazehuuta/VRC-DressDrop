"use client";

import { useState, useTransition } from "react";
import { purchaseDownloadUrl } from "@/app/works/download";
import { Button } from "@/components/ui";

export function RedownloadButton({ purchaseId }: { purchaseId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
            window.location.href = result.url;
          })
        }
      >
        {pending ? "準備中…" : "ダウンロード"}
      </Button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
