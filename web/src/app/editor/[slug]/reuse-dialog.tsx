"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import { editorMessages } from "./messages";

export type ReuseTemplate = { slug: string; name: string; tokenCost: number; thumbnailUrl: string | null };

// 「この画像でほかのグッズも作る」のテンプレートの選択。選ぶと、画像（と文字）を貼った状態で新しいタブに開く
export function ReuseDialog({ templates, onPick, onClose }: { templates: ReuseTemplate[]; onPick: (slug: string) => Promise<void>; onClose: () => void }) {
  const m = useMessages(editorMessages).reuse;
  const titleId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function pick(slug: string) {
    setBusy(slug);
    setError(false);
    try {
      await onPick(slug);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div data-dialog-root className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl shadow-brand/25"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-bold text-brand">
            {m.title}
          </h2>
          <p className="text-sm text-zinc-600">{m.lead}</p>
        </div>
        <ul className="-mx-1 grid grid-cols-2 gap-x-3 gap-y-4 overflow-y-auto px-1 pb-1 sm:grid-cols-3 md:grid-cols-4">
          {templates.map((t) => (
            <li key={t.slug}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void pick(t.slug)}
                className="group flex w-full cursor-pointer flex-col gap-1.5 text-left disabled:cursor-wait disabled:opacity-60"
              >
                <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-zinc-100">
                  {t.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className="font-semibold text-zinc-900 group-hover:underline">{t.name}</span>
                  <span className="text-xs text-accent-dark tabular-nums">{busy === t.slug ? m.opening : m.tokens(t.tokenCost)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {m.error}
          </p>
        )}
        <Button type="button" variant="secondary" className="self-end" onClick={onClose}>
          {m.close}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
