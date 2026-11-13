"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui";
import { useLocale, useMessages } from "@/i18n/client";
import { editorMessages } from "./messages";

export type KeepChoice = "keep" | "overwrite" | "cancel";

const SKIP_KEY = "vrprintlab:overwrite-without-asking";
export const formatSavedAt = (iso: string, locale: "ja" | "en") =>
  new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(iso));

function readSkip() {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSkip() {
  try {
    localStorage.setItem(SKIP_KEY, "1");
  } catch {
    // 保存できなくても次回また確認するだけ
  }
}

type Pending = { resolve: (choice: KeepChoice) => void; previousName: string; savedAt: string | null };

// 既存の作品を上書きする前に、前回の保存内容を別の作品として残すか確認する
export function useKeepPreviousDialog() {
  const locale = useLocale();
  const m = useMessages(editorMessages).keepPrevious;
  const [pending, setPending] = useState<Pending | null>(null);
  const [dontAsk, setDontAsk] = useState(false);

  const ask = useCallback((previousName: string, savedAt: string | null) => {
    if (readSkip()) return Promise.resolve<KeepChoice>("overwrite");
    setDontAsk(false);
    return new Promise<KeepChoice>((resolve) => setPending({ resolve, previousName, savedAt }));
  }, []);

  function choose(choice: KeepChoice) {
    if (!pending) return;
    if (choice === "overwrite" && dontAsk) writeSkip();
    pending.resolve(choice);
    setPending(null);
  }

  const dialog = pending ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keep-previous-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && choose("cancel")}
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-6 shadow-xl">
        <h2 id="keep-previous-title" className="text-lg font-bold text-brand">
          {m.title}
        </h2>
        <p className="text-sm leading-relaxed text-zinc-600">
          {m.body1}
          <strong className="mx-1 text-zinc-900">
            {locale === "en" ? `"` : "「"}
            {m.name(pending.previousName, pending.savedAt ? formatSavedAt(pending.savedAt, locale) : null)}
            {locale === "en" ? `"` : "」"}
          </strong>
          {m.body2}
        </p>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="accent-brand" />
          {m.dontAsk}
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => choose("cancel")}>
            {m.cancel}
          </Button>
          <Button type="button" variant="secondary" onClick={() => choose("overwrite")}>
            {m.overwrite}
          </Button>
          <Button type="button" onClick={() => choose("keep")} disabled={dontAsk} autoFocus>
            {m.keep}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, dialog };
}
