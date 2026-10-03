"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { defaultParams, type ColorParams, type EditorParams, type PrintParams, type SlotParams } from "@/lib/templates/params";
import type { Slot } from "@/lib/templates/schema";
import { ColorControls, PrintControls } from "./controls";
import { loadImage, type LoadedImage } from "./images";
import { useHistory } from "./use-history";

const Viewer = dynamic(() => import("./viewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-zinc-500">3Dモデルを読み込み中…</div>,
});

export type EditorTemplate = { name: string; tokenCost: number; previewModelUrl: string; slots: Slot[] };

export function Editor({ template }: { template: EditorTemplate }) {
  const initial = useMemo(() => defaultParams(template.slots), [template.slots]);
  const history = useHistory<EditorParams>(initial);
  const { value: params, change, commit, undo, redo } = history;
  const [images, setImages] = useState<Record<string, LoadedImage>>({});
  const [resetViewSignal, setResetViewSignal] = useState(0);

  const hasImage = Object.values(params.slots).some((s) => s.kind === "print" && s.imageId);

  const changeSlot = useCallback(
    <T extends SlotParams>(key: string) =>
      (update: (prev: T) => T, isCommit = true) =>
        change((prev) => ({ ...prev, slots: { ...prev.slots, [key]: update(prev.slots[key] as T) } }), isCommit),
    [change],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text") return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // 保存機能ができるまでは、画像を入れた状態での離脱を確認する
  useEffect(() => {
    if (!hasImage) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasImage]);

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-3">
        <div className="h-[55vh] min-h-[320px] overflow-hidden rounded-xl border border-zinc-200 lg:h-[calc(100vh-11rem)] dark:border-zinc-800">
          <Viewer
            modelUrl={template.previewModelUrl}
            slots={template.slots}
            params={params}
            images={images}
            resetViewSignal={resetViewSignal}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={undo} disabled={!history.canUndo} title="元に戻す (Ctrl+Z)">
            元に戻す
          </Button>
          <Button type="button" variant="secondary" onClick={redo} disabled={!history.canRedo} title="やり直す (Ctrl+Shift+Z)">
            やり直す
          </Button>
          <Button type="button" variant="secondary" onClick={() => setResetViewSignal((n) => n + 1)}>
            視点をリセット
          </Button>
          <span className="ml-auto text-xs text-zinc-500">ドラッグで回転・ホイールで拡大縮小</span>
        </div>
      </div>

      <aside className="flex flex-col gap-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
        {template.slots.map((slot) => {
          const slotParams = params.slots[slot.key];
          if (slot.type === "print" && slotParams?.kind === "print") {
            return (
              <PrintControls
                key={slot.key}
                slot={slot}
                params={slotParams}
                image={slotParams.imageId ? images[slotParams.imageId] : undefined}
                onChange={changeSlot<PrintParams>(slot.key)}
                onCommit={commit}
                onImage={async (file) => {
                  const loaded = await loadImage(file);
                  setImages((prev) => ({ ...prev, [loaded.id]: loaded }));
                  changeSlot<PrintParams>(slot.key)((p) => ({ ...p, imageId: loaded.id }));
                }}
              />
            );
          }
          if (slot.type === "color" && slotParams?.kind === "color") {
            return <ColorControls key={slot.key} slot={slot} params={slotParams} onChange={changeSlot<ColorParams>(slot.key)} onCommit={commit} />;
          }
          return null;
        })}

        <div className="mt-auto flex flex-col gap-2 rounded-lg bg-zinc-100 p-4 text-sm dark:bg-zinc-800">
          <p>
            ダウンロードに必要なトークン: <strong className="text-base">{template.tokenCost}</strong>
          </p>
          <p className="text-xs text-zinc-500">保存とダウンロードは準備中です。</p>
        </div>
      </aside>
    </div>
  );
}
