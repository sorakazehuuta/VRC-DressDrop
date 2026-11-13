"use client";

import { useMessages } from "@/i18n/client";
import type { GimmickSelection } from "@/lib/gimmicks/schema";
import { editorMessages } from "../messages";
import { findSelection, num, PREVIEW_SLUGS, type PreviewState, type PrimaryAction } from "./spec";

const chip = "pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors";

// 3D表示の左下に重ねる、ギミックのプレビューの操作欄
export function PreviewOverlay({
  selected,
  preview,
  action,
  onPrimary,
  onToggleNear,
  onTogglePlaying,
  onToggleDark,
}: {
  selected: GimmickSelection[];
  preview: PreviewState;
  action: PrimaryAction | null;
  onPrimary: () => void;
  onToggleNear: () => void;
  onTogglePlaying: () => void;
  onToggleDark: () => void;
}) {
  const m = useMessages(editorMessages).preview;
  if (selected.length === 0) return null;

  const approach = findSelection(selected, "glow-on-approach");
  const hints = preview.playing
    ? [
        action?.hint,
        approach && m.approach(num(approach.params, "distance", 2)),
        selected.some((s) => !(PREVIEW_SLUGS as readonly string[]).includes(s.slug)) && m.unsupported,
      ].filter((h): h is string => Boolean(h))
    : [m.stopped];

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-start gap-1.5">
      <p className="rounded-lg bg-white/85 px-2 py-1 text-[11px] leading-relaxed text-zinc-700 shadow-sm">
        <span className="font-semibold text-brand">{m.title}</span>
        {m.approximate}
        {hints.map((h) => (
          <span key={h} className="block">
            {h}
          </span>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        {preview.playing && action && (
          <button type="button" onClick={onPrimary} className={`${chip} bg-accent text-white hover:bg-accent-dark`}>
            {action.label}
          </button>
        )}
        {preview.playing && approach && (
          <button type="button" onClick={onToggleNear} aria-pressed={preview.near} className={`${chip} bg-accent text-white hover:bg-accent-dark`}>
            {preview.near ? m.leave : m.approachButton}
          </button>
        )}
        <button type="button" onClick={onTogglePlaying} aria-pressed={!preview.playing} className={`${chip} bg-white/90 text-zinc-800 hover:bg-white`}>
          {preview.playing ? m.stop : m.play}
        </button>
        <button
          type="button"
          onClick={onToggleDark}
          aria-pressed={preview.dark}
          className={`${chip} ${preview.dark ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-white/90 text-zinc-800 hover:bg-white"}`}
        >
          {preview.dark ? m.bright : m.dark}
        </button>
      </div>
    </div>
  );
}
