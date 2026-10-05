"use client";

import type { GimmickSelection } from "@/lib/gimmicks/schema";
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
  if (selected.length === 0) return null;

  const approach = findSelection(selected, "glow-on-approach");
  const hints = preview.playing
    ? [
        action?.hint,
        approach && `人が ${num(approach.params, "distance", 2)}m 以内に近づくと光ります。`,
        selected.some((s) => !(PREVIEW_SLUGS as readonly string[]).includes(s.slug)) && "選んだギミックの一部は、プレビューに対応していません。",
      ].filter((h): h is string => Boolean(h))
    : ["ギミックの動きを止めています。"];

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-start gap-1.5">
      <p className="rounded-md bg-white/85 px-2 py-1 text-[11px] leading-relaxed text-zinc-700 shadow-sm">
        <span className="font-semibold text-brand">ギミックのプレビュー</span>（動きは目安です）
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
            {preview.near ? "人が離れる" : "人が近づく"}
          </button>
        )}
        <button type="button" onClick={onTogglePlaying} aria-pressed={!preview.playing} className={`${chip} bg-white/90 text-zinc-800 hover:bg-white`}>
          {preview.playing ? "■ 動きを止める" : "▶ 動きを再生"}
        </button>
        <button
          type="button"
          onClick={onToggleDark}
          aria-pressed={preview.dark}
          className={`${chip} ${preview.dark ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-white/90 text-zinc-800 hover:bg-white"}`}
        >
          {preview.dark ? "☀ 明るい場所で見る" : "☾ 暗い場所で見る"}
        </button>
      </div>
    </div>
  );
}
