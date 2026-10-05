"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 画面中央に出す確認ダイアログ。Escape か背景のクリックで閉じる。
// ヘッダー（backdrop-filter があり fixed の基準になる）の中から開いても画面全体に出るよう、body の直下に描画する
export function ConfirmDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div data-dialog-root className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold text-brand">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
