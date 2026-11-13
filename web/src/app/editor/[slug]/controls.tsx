"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { pick } from "@/i18n/messages";
import { ACRYLIC_LIMITS, DEFAULT_RECT, normalizeAcrylic, resolveAcrylic, type AcrylicParams, type PrintOutline } from "@/lib/templates/acrylic";
import { PRINT_LIMITS, defaultPrintParams, textureDimensions, type ColorParams, type PrintParams } from "@/lib/templates/params";
import { slotLabel, type ColorSlot, type PrintSlot } from "@/lib/templates/schema";
import { TEXT_FONTS, TEXT_LIMITS, defaultPrintText, type PrintText, type TextFont } from "@/lib/templates/text";
import { IMAGE_LIMITS, type LoadedImage } from "./images";
import { editorMessages } from "./messages";
import { createPrintGuide, downloadBlob } from "./print-guide";
import { DEFAULT_BACKGROUND_OPTIONS, type BackgroundOptions } from "./background";

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
  onRemoveBackground,
  onRestoreBackground,
  onReuse,
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
  // 背景を消した画像に差し替える（結果の種類を返す）。元の画像に戻す
  onRemoveBackground: (options: BackgroundOptions) => Promise<"done" | "already-transparent" | "nothing">;
  onRestoreBackground: () => void;
  // この画像（と文字）でほかのグッズも作る。画像も文字もなければ undefined
  onReuse?: () => void;
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

      {image && <BackgroundRemover image={image} onApply={onRemoveBackground} onRestore={onRestoreBackground} />}

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
          onClick={() =>
            onChange((p) => ({ ...defaultPrintParams(), imageId: p.imageId, ...(p.text ? { text: p.text } : {}), ...(p.acrylic ? { acrylic: p.acrylic } : {}) }))
          }
        >
          {c.resetPrint}
        </Button>
      </fieldset>

      {slot.outline && slot.background === "transparent" && (
        <AcrylicControls outline={slot.outline} acrylic={params.acrylic} onChange={onChange} onCommit={onCommit} />
      )}

      <TextControls text={params.text} onChange={onChange} onCommit={onCommit} />

      {onReuse && (
        <Button type="button" variant="secondary" className="self-start" onClick={onReuse}>
          {c.reuse}
        </Button>
      )}
    </section>
  );
}

// アクリルの板の形（印刷面の定義に outline があるときだけ）。テンプレートの既定（絵の形・既定の幅）のときは編集内容に項目を持たせない。
// 切り替えたときに、もう一方の形の設定をこの欄で覚えておく
function AcrylicControls({
  outline,
  acrylic,
  onChange,
  onCommit,
}: {
  outline: PrintOutline;
  acrylic: AcrylicParams | undefined;
  onChange: Change<PrintParams>;
  onCommit: () => void;
}) {
  const locale = useLocale();
  const c = pick(editorMessages, locale).controls;
  const id = useId();
  const current = resolveAcrylic(outline, acrylic);
  const [lastBorder, setLastBorder] = useState(current.shape === "cutout" ? current.border : outline.width);
  const [lastRect, setLastRect] = useState<AcrylicParams>(current.shape === "rect" ? current : DEFAULT_RECT);

  const set = (next: AcrylicParams, commit: boolean) => {
    if (next.shape === "cutout") setLastBorder(next.border);
    else setLastRect(next);
    const normalized = normalizeAcrylic(next, outline);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onChange(({ acrylic: _removed, ...p }) => (normalized ? { ...p, acrylic: normalized } : p), commit);
  };

  // 実寸があれば mm、なければ % で出す
  const size = outline.sizeMm;
  const mm = (scale: number): Display => ({ scale, unit: "mm" });
  const rectHeightMm = size ? size.height * (outline.tab > 0 ? 1 - outline.rectBottom : 1) : 0;
  const borderDisplay = size ? mm(Math.min(size.width, size.height)) : PERCENT;
  const widthDisplay = size ? mm(size.width) : PERCENT;
  const heightDisplay = size ? mm(rectHeightMm) : PERCENT;
  const decimals = size ? 1 : 0;

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4" data-acrylic-controls>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-zinc-900">{c.acrylicHeading}</h3>
        <p className="text-xs text-zinc-600">{c.acrylicHint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" role="radiogroup" aria-label={c.acrylicHeading}>
        {(["cutout", "rect"] as const).map((shape) => (
          <label key={shape} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`${id}-shape`}
              checked={current.shape === shape}
              onChange={() => set(shape === "cutout" ? { shape: "cutout", border: lastBorder } : lastRect, true)}
              className="accent-brand"
            />
            {c.acrylicShapes[shape]}
          </label>
        ))}
      </div>
      {current.shape === "cutout" ? (
        <>
          <Slider
            label={c.acrylicBorder}
            value={current.border}
            limits={ACRYLIC_LIMITS.border}
            display={borderDisplay}
            decimals={decimals}
            onChange={(v) => set({ shape: "cutout", border: v }, false)}
            onCommit={onCommit}
          />
          <p className="-mt-1 text-xs text-zinc-500">{c.acrylicBorderHint}</p>
        </>
      ) : (
        <>
          <Slider
            label={c.acrylicWidth}
            value={current.width}
            limits={ACRYLIC_LIMITS.size}
            display={widthDisplay}
            decimals={decimals}
            onChange={(v) => set({ ...current, width: v }, false)}
            onCommit={onCommit}
          />
          <Slider
            label={c.acrylicHeight}
            value={current.height}
            limits={ACRYLIC_LIMITS.size}
            display={heightDisplay}
            decimals={decimals}
            onChange={(v) => set({ ...current, height: v }, false)}
            onCommit={onCommit}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={current.rounded} onChange={(e) => set({ ...current, rounded: e.target.checked }, true)} className="accent-brand" />
            {c.acrylicRounded}
          </label>
          <p className="text-xs text-zinc-500">{c.acrylicRectHint}</p>
        </>
      )}
    </div>
  );
}

const TEXT_SWATCHES = ["#031e42", "#111111", "#ffffff", "#dc2626", "#00837e", "#facc15"];
const SIZE_DISPLAY: Display = { scale: 100, unit: "%" };

// 文字を入れる欄。画像がなくても使える（価格札・お品書きなど）。
// 文字が空のときは編集内容に文字の項目を持たせず、設定（大きさ・色など）だけをこの欄で覚えておく
function TextControls({ text, onChange, onCommit }: { text: PrintText | undefined; onChange: Change<PrintParams>; onCommit: () => void }) {
  const locale = useLocale();
  const c = pick(editorMessages, locale).controls;
  const [draft, setDraft] = useState<PrintText>(text ?? defaultPrintText());
  // 元に戻す・やり直すで文字が変わったら、欄の表示も合わせる
  const [shown, setShown] = useState(text);
  if (shown !== text) {
    setShown(text);
    if (text) setDraft(text);
    else setDraft((d) => ({ ...d, content: "" }));
  }
  const id = useId();

  const update = (patch: Partial<PrintText>, commit: boolean) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!next.content.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      if (text) onChange(({ text: _removed, ...p }) => p, commit);
      return;
    }
    onChange((p) => ({ ...p, text: next }), commit);
  };

  const colorRow = (label: string, value: string, key: "color" | "outlineColor") => (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-24 shrink-0">{label}</span>
      {TEXT_SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={c.textSwatch(label, hex)}
          aria-pressed={value === hex}
          onClick={() => update({ [key]: hex }, true)}
          className={`h-6 w-6 cursor-pointer rounded-full border ${value === hex ? "ring-2 ring-accent ring-offset-1" : "border-zinc-300"}`}
          style={{ backgroundColor: hex }}
        />
      ))}
      <input
        type="color"
        value={value}
        aria-label={c.textOtherColor(label)}
        onChange={(e) => update({ [key]: e.target.value }, false)}
        onBlur={onCommit}
        className="h-7 w-9 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4" data-text-controls>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-bold text-zinc-900">
          {c.textHeading}
        </label>
        <p className="text-xs text-zinc-600">{c.textHint}</p>
      </div>
      <textarea
        id={id}
        value={draft.content}
        rows={3}
        maxLength={TEXT_LIMITS.maxLength}
        placeholder={c.textPlaceholder}
        onChange={(e) => update({ content: e.target.value.split("\n").slice(0, TEXT_LIMITS.maxLines).join("\n") }, false)}
        onBlur={onCommit}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <p className="-mt-2 text-right text-xs text-zinc-500 tabular-nums">{c.textCount(draft.content.length, TEXT_LIMITS.maxLength, TEXT_LIMITS.maxLines)}</p>
      <fieldset disabled={!draft.content.trim()} className="flex flex-col gap-3 disabled:opacity-40">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="w-24 shrink-0">{c.textFont}</span>
          {(Object.keys(TEXT_FONTS) as TextFont[]).map((f) => (
            <label key={f} className="flex items-center gap-1.5">
              <input type="radio" name={`${id}-font`} checked={draft.font === f} onChange={() => update({ font: f }, true)} className="accent-brand" />
              {locale === "en" ? TEXT_FONTS[f].labelEn : TEXT_FONTS[f].label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="w-24 shrink-0">{c.textAlign}</span>
          {(["left", "center", "right"] as const).map((a) => (
            <label key={a} className="flex items-center gap-1.5">
              <input type="radio" name={`${id}-align`} checked={draft.align === a} onChange={() => update({ align: a }, true)} className="accent-brand" />
              {c.textAligns[a]}
            </label>
          ))}
        </div>
        <Slider label={c.textSize} value={draft.size} limits={TEXT_LIMITS.size} display={SIZE_DISPLAY} decimals={1} onChange={(v) => update({ size: v }, false)} onCommit={onCommit} />
        <Slider label={c.textOffsetX} value={draft.offsetX} limits={TEXT_LIMITS.offset} display={PERCENT} onChange={(v) => update({ offsetX: v }, false)} onCommit={onCommit} />
        <Slider label={c.textOffsetY} value={draft.offsetY} limits={TEXT_LIMITS.offset} display={PERCENT} onChange={(v) => update({ offsetY: v }, false)} onCommit={onCommit} />
        {colorRow(c.textColor, draft.color, "color")}
        {colorRow(c.textOutline, draft.outlineColor, "outlineColor")}
        <Slider
          label={c.textOutlineWidth}
          value={draft.outlineWidth}
          limits={TEXT_LIMITS.outlineWidth}
          display={SIZE_DISPLAY}
          decimals={1}
          onChange={(v) => update({ outlineWidth: v }, false)}
          onCommit={onCommit}
        />
      </fieldset>
    </div>
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

// 背景の色を消す欄。消したあとは「消す範囲」と「内側も消す」を変えると、元の画像から作り直す
function BackgroundRemover({
  image,
  onApply,
  onRestore,
}: {
  image: LoadedImage;
  onApply: (options: BackgroundOptions) => Promise<"done" | "already-transparent" | "nothing">;
  onRestore: () => void;
}) {
  const locale = useLocale();
  const c = pick(editorMessages, locale).controls;
  const applied = image.background;
  const [options, setOptions] = useState<BackgroundOptions>(applied?.options ?? DEFAULT_BACKGROUND_OPTIONS);
  // 数値欄に打ち込んで確定したときも最新の値で作り直すよう、参照でも持つ
  // （描画中は書き換えず、操作のときだけ書き換える）
  const latest = useRef(options);
  const [state, setState] = useState<{ kind: "idle" | "working" | "done" | "already-transparent" | "nothing" | "error"; ratio?: number }>({ kind: "idle" });

  // 別の画像に替わったら（元に戻す・やり直すを含む）、その画像の設定を表示する
  const [shownId, setShownId] = useState(image.id);
  if (shownId !== image.id) {
    setShownId(image.id);
    setOptions(image.background?.options ?? DEFAULT_BACKGROUND_OPTIONS);
    if (state.kind !== "working") setState({ kind: "idle" });
  }

  async function apply(next: BackgroundOptions) {
    latest.current = next;
    setOptions(next);
    setState({ kind: "working" });
    try {
      const kind = await onApply(next);
      setState({ kind });
    } catch {
      setState({ kind: "error" });
    }
  }

  const message =
    state.kind === "already-transparent" ? c.bgAlready : state.kind === "nothing" ? c.bgNothing : state.kind === "error" ? c.bgError : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3" data-background-remover>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-zinc-900">{c.bgHeading}</h3>
        {applied && (
          <button type="button" onClick={onRestore} className="cursor-pointer text-xs font-semibold text-accent-dark hover:underline">
            {c.bgRestore}
          </button>
        )}
      </div>
      {!applied ? (
        <>
          <p className="text-xs text-zinc-600">{c.bgHint}</p>
          <Button type="button" variant="secondary" className="self-start" disabled={state.kind === "working"} onClick={() => void apply(options)}>
            {state.kind === "working" ? c.bgApplying : c.bgApply}
          </Button>
        </>
      ) : (
        <>
          <Slider
            label={c.bgTolerance}
            value={options.tolerance}
            limits={{ min: 1, max: 100, step: 1 }}
            display={{ scale: 1, unit: "" }}
            onChange={(v) => {
              latest.current = { ...options, tolerance: v };
              setOptions(latest.current);
            }}
            onCommit={() => void apply(latest.current)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!options.contiguous}
              onChange={(e) => void apply({ ...options, contiguous: !e.target.checked })}
              className="accent-brand"
            />
            {c.bgInside}
          </label>
          {state.kind === "working" && <p className="text-xs text-zinc-500">{c.bgApplying}</p>}
        </>
      )}
      {message && (
        <p role={state.kind === "error" ? "alert" : "status"} className={`text-xs ${state.kind === "error" ? "text-red-700" : "text-zinc-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
