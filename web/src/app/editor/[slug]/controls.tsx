"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { pick } from "@/i18n/messages";
import { PRINT_LIMITS, defaultPrintParams, textureDimensions, type ColorParams, type PrintParams } from "@/lib/templates/params";
import { slotLabel, type ColorSlot, type PrintSlot } from "@/lib/templates/schema";
import { IMAGE_LIMITS, type LoadedImage } from "./images";
import { editorMessages } from "./messages";
import { createPrintGuide, downloadBlob } from "./print-guide";

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
  modelUrl,
  fileBase,
}: {
  slot: PrintSlot;
  params: PrintParams;
  image: LoadedImage | undefined;
  onChange: Change<PrintParams>;
  onCommit: () => void;
  onImage: (file: File) => Promise<void>;
  // 下絵を作るためのプレビュー用モデルと、下絵のファイル名の先頭（テンプレートの slug）
  modelUrl: string;
  fileBase: string;
}) {
  const locale = useLocale();
  const m = pick(editorMessages, locale);
  const c = m.controls;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [guideState, setGuideState] = useState<"idle" | "making" | "error">("idle");
  const size = textureDimensions(slot);

  async function downloadGuide() {
    setGuideState("making");
    try {
      const blob = await createPrintGuide(modelUrl, slot);
      downloadBlob(blob, `VRPrintLab_${fileBase}_${slot.key}_${size.width}x${size.height}.png`);
      setGuideState("idle");
    } catch {
      setGuideState("error");
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      await onImage(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : m.errors.imageLoad);
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

  // 横幅・高さを変える。縦横比を固定しているときは、今の比率のままもう一方も変える（どちらも範囲内に収まるように丸める）
  function setScale(axis: "x" | "y", value: number) {
    onChange((p) => {
      if (!p.keepAspect) return axis === "x" ? { ...p, scaleX: value } : { ...p, scaleY: value };
      const { min, max } = PRINT_LIMITS.scale;
      const ratio = p.scaleY / p.scaleX;
      const x = Math.min(Math.min(max, max / ratio), Math.max(Math.max(min, min / ratio), axis === "x" ? value : value / ratio));
      return { ...p, scaleX: x, scaleY: x * ratio };
    }, false);
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-bold text-brand">{slotLabel(slot, locale)}</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        // 印刷面を表す欄なので、四隅にトンボを付ける（トンボが操作欄からはみ出さないよう左右と上下に余白を取る）
        className={`trim-marks mx-4 my-3 flex flex-col items-center gap-2 p-5 text-center text-sm transition-colors ${
          dragging ? "bg-accent-soft ring-2 ring-accent" : "bg-zinc-100"
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
            {c.dropHere}
            <span className="block text-xs">{c.formats(IMAGE_LIMITS.maxSide)}</span>
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={loading} onClick={() => inputRef.current?.click()}>
            {loading ? c.loading : image ? c.change : c.choose}
          </Button>
          {image && (
            <Button type="button" variant="secondary" onClick={() => onChange((p) => ({ ...p, imageId: null }))}>
              {c.remove}
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

      <div className="flex flex-col gap-1.5 text-xs text-zinc-600">
        <p>
          <span className="font-semibold text-zinc-800 tabular-nums">{c.printSize(size.width, size.height)}</span>
          <span className="ml-1.5">{c.printSizeHint}</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <button
            type="button"
            onClick={() => void downloadGuide()}
            disabled={guideState === "making"}
            title={c.guideHint}
            className="cursor-pointer font-semibold text-accent-dark underline underline-offset-2 hover:text-brand disabled:cursor-wait disabled:opacity-60"
          >
            {guideState === "making" ? c.guideMaking : c.guide}
          </button>
          <span className="text-zinc-500">{c.guideShort}</span>
        </p>
        {guideState === "error" && (
          <p role="alert" className="text-red-700">
            {c.guideError}
          </p>
        )}
      </div>

      {!image && <p className="text-xs text-zinc-500">{c.chooseHint}</p>}
      <fieldset disabled={!image} className="flex flex-col gap-4 disabled:opacity-40">
        <div className="flex flex-col gap-3">
          <Slider label={c.width} value={params.scaleX} limits={PRINT_LIMITS.scale} display={PERCENT} onChange={(v) => setScale("x", v)} onCommit={onCommit} />
          <Slider label={c.height} value={params.scaleY} limits={PRINT_LIMITS.scale} display={PERCENT} onChange={(v) => setScale("y", v)} onCommit={onCommit} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={params.keepAspect}
                onChange={(e) => onChange((p) => ({ ...p, keepAspect: e.target.checked }))}
                className="accent-brand"
              />
              {c.lockAspect}
              <span className="text-xs text-zinc-500">{c.lockAspectHint}</span>
            </label>
            {Math.abs(params.scaleX - params.scaleY) > 0.0001 && (
              <button
                type="button"
                onClick={() => onChange((p) => ({ ...p, scaleY: p.scaleX }))}
                className="cursor-pointer text-xs font-medium text-accent-dark hover:underline"
              >
                {c.resetAspect}
              </button>
            )}
          </div>
        </div>
        <Slider label={c.offsetX} value={params.offsetX} limits={PRINT_LIMITS.offset} display={PERCENT} onChange={(v) => live({ offsetX: v })} onCommit={onCommit} />
        <Slider label={c.offsetY} value={params.offsetY} limits={PRINT_LIMITS.offset} display={PERCENT} onChange={(v) => live({ offsetY: v })} onCommit={onCommit} />
        <Slider label={c.rotation} value={params.rotation} limits={PRINT_LIMITS.rotation} display={DEGREE} onChange={(v) => live({ rotation: v })} onCommit={onCommit} />
        <Slider label={c.brightness} value={params.brightness} limits={PRINT_LIMITS.brightness} display={PLAIN_PERCENT} onChange={(v) => live({ brightness: v })} onCommit={onCommit} />
        <Slider label={c.saturation} value={params.saturation} limits={PRINT_LIMITS.saturation} display={PLAIN_PERCENT} onChange={(v) => live({ saturation: v })} onCommit={onCommit} />
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => onChange((p) => ({ ...defaultPrintParams(), imageId: p.imageId }))}
        >
          {c.resetPrint}
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
  const locale = useLocale();
  const m = pick(editorMessages, locale);
  const c = m.controls;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold text-brand">{slotLabel(slot, locale)}</h2>
      {/* 選択中の枠（ring + offset で外側に 4px）が親のスクロール領域で切れないよう余白を取る */}
      <div className="grid w-fit grid-cols-8 gap-2 p-1">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={c.color(color)}
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
        <span>{c.otherColors}</span>
        <span className="font-mono text-zinc-500">{params.color}</span>
      </label>
    </section>
  );
}
