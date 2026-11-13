"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { useLocalePath, useMessages } from "@/i18n/client";
import { saveDraft } from "./editor/[slug]/draft";
import { IMAGE_LIMITS, loadImage } from "./editor/[slug]/images";
import { editorMessages } from "./editor/[slug]/messages";
import { homeMessages } from "./home-messages";

// トップページの「画像を1枚アップして3Dプレビューを試す」。選んだ画像を下書き（IndexedDB）に入れて、
// その画像を貼った状態のエディタを開く（「この画像でほかのグッズも作る」と同じ仕組み。ログインは不要）
export function HomeUpload({ templateSlug }: { templateSlug: string }) {
  const m = useMessages(homeMessages);
  const errors = useMessages(editorMessages).errors;
  const toLocale = useLocalePath();
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setBusy(true);
    try {
      // 形式・大きさを先に確かめる（エディタと同じ条件）
      const image = await loadImage(file, errors);
      image.source.close();
      try {
        await saveDraft(templateSlug, {
          name: "",
          carry: { imageId: image.id },
          images: [{ id: image.id, file }],
          savedAt: Date.now(),
        });
      } catch {
        throw new Error(m.openError);
      }
      window.location.assign(toLocale(`/editor/${templateSlug}?draft=1`));
    } catch (e) {
      setError(e instanceof Error ? e.message : m.openError);
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void open(e.dataTransfer.files[0]);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-labelledby={titleId}
      role="group"
      className={`relative flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-5 pt-7 pb-9 text-center transition-colors ${
        dragging ? "border-accent bg-accent-soft" : "border-brand/55 bg-white/60"
      }`}
    >
      <p id={titleId} className="text-[15px] font-bold text-brand [word-break:auto-phrase]">
        {dragging ? m.dropHint : m.tryTitle}
      </p>
      {/* アイコンとボタンは、右下の見本の画像にかからないよう少し左に寄せる */}
      <div className="flex flex-col items-center gap-4 sm:pr-20 md:pr-0 lg:pr-20">
        <UploadIcon />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-describedby={error ? errorId : undefined}
          className="min-w-44 cursor-pointer rounded-lg bg-accent px-8 py-3 text-base font-bold text-white hover:bg-accent-dark disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? m.opening : m.upload}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_LIMITS.types.join(",")}
        className="hidden"
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {/* 貼る画像の見本。押せそうに見えないよう、操作は持たせない */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-5 -bottom-7 hidden w-28 rotate-[7deg] sm:block md:hidden lg:block">
        <div className="rounded-lg bg-white p-1.5 shadow-lg shadow-brand/20 ring-1 ring-zinc-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/sample-art.webp" alt="" width={363} height={640} className="aspect-[5/6] w-full rounded object-cover object-top" />
        </div>
        <PointerIcon className="absolute -right-3 -bottom-4 w-9 -rotate-[7deg] drop-shadow" />
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-9 w-9 text-accent-dark"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 17.5v-6" />
      <path d="m9.25 14.25 2.75-2.75 2.75 2.75" />
    </svg>
  );
}

// マウスの手のカーソル（人差し指を立てた形）
function PointerIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 30" aria-hidden="true" className={className}>
      <path
        d="M9 1.5c1.1 0 2 .9 2 2v7.6c.4-.6 1-1 1.8-1 1 0 1.8.7 2 1.6.4-.5 1-.8 1.7-.8 1.1 0 1.9.8 2 1.8.4-.4.9-.6 1.5-.6 1.1 0 2 .9 2 2v5.4c0 4.4-3.1 8-7.5 8h-1.6c-2.4 0-4.2-1-5.6-2.8l-4.7-6.1c-.7-.9-.5-2.1.4-2.7.9-.6 2-.4 2.7.4L7 18.4V3.5c0-1.1.9-2 2-2z"
        fill="#fff"
        stroke="#031e42"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path d="M11 11.2v4.3M14.8 11.7v3.8M18.5 13v3" fill="none" stroke="#031e42" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}
