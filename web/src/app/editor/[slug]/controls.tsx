"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui";
import { PRINT_LIMITS, defaultPrintParams, type ColorParams, type PrintParams } from "@/lib/templates/params";
import type { ColorSlot, PrintSlot } from "@/lib/templates/schema";
import { IMAGE_LIMITS, type LoadedImage } from "./images";

type Change<T> = (update: (prev: T) => T, commit?: boolean) => void;

// display: 画面に出す単位への換算（例: 0.5 → 50%）。数値欄に直接入力もできる
export type Display = { scale: number; unit: string };
const PERCENT: Display = { scale: 100, unit: "%" };
const PLAIN_PERCENT: Display = { scale: 1, unit: "%" };
const DEGREE: Display = { scale: 1, unit: "°" };

export function Slider({
  label,
  value,
  limits,
  display,
  decimals = 0,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number };
  display: Display;
  decimals?: number;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const id = useId();
  // 入力中だけ文字列を持つ（「-」や空欄などの途中の状態を許すため）
  const [text, setText] = useState<string | null>(null);
  const round = (v: number) => Number(v.toFixed(decimals));
  const shown = round(value * display.scale);
  const min = round(limits.min * display.scale);
  const max = round(limits.max * display.scale);

  function applyText(raw: string) {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, n)) / display.scale);
  }

  function finish() {
    if (text !== null) applyText(text);
    setText(null);
    onCommit();
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id}>{label}</label>
        <span className="flex items-center gap-1 text-zinc-500">
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${label}（${display.unit}）`}
            min={min}
            max={max}
            step={10 ** -decimals}
            value={text ?? shown}
            onFocus={(e) => {
              setText(String(shown));
              e.target.select();
            }}
            onChange={(e) => {
              setText(e.target.value);
              applyText(e.target.value);
            }}
            onBlur={finish}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setText(null);
                e.currentTarget.blur();
              }
            }}
            className="w-16 rounded border border-zinc-300 px-1.5 py-0.5 text-right tabular-nums text-zinc-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <span className="min-w-3 whitespace-nowrap">{display.unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        className="w-full cursor-pointer accent-brand"
      />
    </div>
  );
}

export function PrintControls({
  slot,
  params,
  image,
  onChange,
  onCommit,
  onImage,
}: {
  slot: PrintSlot;
  params: PrintParams;
  image: LoadedImage | undefined;
  onChange: Change<PrintParams>;
  onCommit: () => void;
  onImage: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      await onImage(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files[0]);
  }

  const live = (patch: Partial<PrintParams>) => onChange((p) => ({ ...p, ...patch }), false);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-semibold">{slot.label}</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${
          dragging ? "border-brand bg-zinc-100" : "border-zinc-300"
        }`}
      >
        {image ? (
          <p className="break-all">
            <span className="font-medium">{image.name}</span>
            <span className="block text-xs text-zinc-500">
              {image.width}×{image.height}px
            </span>
          </p>
        ) : (
          <p className="text-zinc-600">
            画像をここにドラッグ＆ドロップ
            <span className="block text-xs">PNG（透過OK）/ JPEG・10MB・長辺{IMAGE_LIMITS.maxSide}pxまで</span>
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={loading} onClick={() => inputRef.current?.click()}>
            {loading ? "読み込み中…" : image ? "画像を変更" : "画像を選ぶ"}
          </Button>
          {image && (
            <Button type="button" variant="secondary" onClick={() => onChange((p) => ({ ...p, imageId: null }))}>
              外す
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_LIMITS.types.join(",")}
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {!image && <p className="text-xs text-zinc-500">画像を選ぶと、大きさ・位置・回転・色合いを調整できます。</p>}
      <fieldset disabled={!image} className="flex flex-col gap-4 disabled:opacity-40">
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.keepAspect}
              onChange={(e) =>
                onChange((p) => ({ ...p, keepAspect: e.target.checked, scaleY: e.target.checked ? p.scaleX : p.scaleY }))
              }
              className="accent-brand"
            />
            縦横比を固定
          </label>
          {params.keepAspect ? (
            <Slider
              label="サイズ"
              value={params.scaleX}
              limits={PRINT_LIMITS.scale}
              display={PERCENT}
              onChange={(v) => live({ scaleX: v, scaleY: v })}
              onCommit={onCommit}
            />
          ) : (
            <>
              <Slider label="横幅" value={params.scaleX} limits={PRINT_LIMITS.scale} display={PERCENT} onChange={(v) => live({ scaleX: v })} onCommit={onCommit} />
              <Slider label="高さ" value={params.scaleY} limits={PRINT_LIMITS.scale} display={PERCENT} onChange={(v) => live({ scaleY: v })} onCommit={onCommit} />
            </>
          )}
        </div>
        <Slider label="位置（左右）" value={params.offsetX} limits={PRINT_LIMITS.offset} display={PERCENT} onChange={(v) => live({ offsetX: v })} onCommit={onCommit} />
        <Slider label="位置（上下）" value={params.offsetY} limits={PRINT_LIMITS.offset} display={PERCENT} onChange={(v) => live({ offsetY: v })} onCommit={onCommit} />
        <Slider label="回転" value={params.rotation} limits={PRINT_LIMITS.rotation} display={DEGREE} onChange={(v) => live({ rotation: v })} onCommit={onCommit} />
        <Slider label="明るさ" value={params.brightness} limits={PRINT_LIMITS.brightness} display={PLAIN_PERCENT} onChange={(v) => live({ brightness: v })} onCommit={onCommit} />
        <Slider label="彩度" value={params.saturation} limits={PRINT_LIMITS.saturation} display={PLAIN_PERCENT} onChange={(v) => live({ saturation: v })} onCommit={onCommit} />
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => onChange((p) => ({ ...defaultPrintParams(), imageId: p.imageId }))}
        >
          配置と色調をリセット
        </Button>
      </fieldset>
    </section>
  );
}

// 8色×2行（1行目: 無彩色と茶系、2行目: 色相の順）
const SWATCHES = [
  ["#ffffff", "#e5e5e5", "#6b7280", "#1f2937", "#111111", "#e8dcc4", "#8a7f5a", "#7c4a2d"],
  ["#dc2626", "#f97316", "#facc15", "#16a34a", "#38bdf8", "#1e3a8a", "#7c3aed", "#f9a8d4"],
].flat();

export function ColorControls({
  slot,
  params,
  onChange,
  onCommit,
}: {
  slot: ColorSlot;
  params: ColorParams;
  onChange: Change<ColorParams>;
  onCommit: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{slot.label}</h2>
      {/* 選択中の枠（ring + offset で外側に 4px）が親のスクロール領域で切れないよう余白を取る */}
      <div className="grid w-fit grid-cols-8 gap-2 p-1">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={`色 ${color}`}
            onClick={() => onChange((p) => ({ ...p, color }))}
            className={`h-8 w-8 cursor-pointer rounded-full border shadow-sm ${
              params.color.toLowerCase() === color ? "ring-2 ring-brand ring-offset-2" : "border-zinc-300"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="color"
          value={params.color}
          onChange={(e) => onChange((p) => ({ ...p, color: e.target.value }), false)}
          onBlur={onCommit}
          className="h-9 w-14 cursor-pointer rounded border border-zinc-300 bg-transparent"
        />
        <span>その他の色</span>
        <span className="font-mono text-zinc-500">{params.color}</span>
      </label>
    </section>
  );
}
