"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { duplicateWork, saveWork } from "@/app/works/actions";
import { Button } from "@/components/ui";
import { defaultParams, type ColorParams, type EditorParams, type PrintParams, type SlotParams } from "@/lib/templates/params";
import type { Slot } from "@/lib/templates/schema";
import type { GimmickDefinition, GimmickSelection } from "@/lib/gimmicks/schema";
import { ColorControls, PrintControls } from "./controls";
import { DownloadPanel } from "./download-panel";
import { GimmickPanel } from "./gimmick-panel";
import { saveDraft, takeDraft } from "./draft";
import { loadImage, type LoadedImage } from "./images";
import { formatSavedAt, useKeepPreviousDialog } from "./keep-previous-dialog";
import { imageExt, uploadImages, uploadThumbnail } from "./save";
import { useHistory } from "./use-history";

const Viewer = dynamic(() => import("./viewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-zinc-500">3Dモデルを読み込み中…</div>,
});

export type EditorTemplate = { id: string; slug: string; name: string; tokenCost: number; previewModelUrl: string; slots: Slot[] };

export type InitialWork = {
  id: string;
  name: string;
  params: EditorParams;
  gimmicks: GimmickSelection[];
  images: { id: string; slot: string; url: string; ext: "png" | "jpg" }[];
  suspended: boolean;
  updatedAt: string;
};

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string; limit?: boolean };

// 「元に戻す」の履歴で扱う編集内容（見た目の設定とギミックの選択）
type EditorState = { params: EditorParams; gimmicks: GimmickSelection[] };

const snapshot = (name: string, state: EditorState) => JSON.stringify({ name, params: state.params, gimmicks: state.gimmicks });
const timeFormat = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

async function fetchSavedImage(img: InitialWork["images"][number]) {
  const res = await fetch(img.url);
  if (!res.ok) throw new Error("画像を読み込めませんでした");
  const blob = await res.blob();
  const type = img.ext === "png" ? "image/png" : "image/jpeg";
  return loadImage(new File([blob], `${img.slot}.${img.ext}`, { type }), img.id);
}

type EditorProps = {
  template: EditorTemplate;
  gimmickDefs: GimmickDefinition[];
  userId: string | null;
  initialWork: InitialWork | null;
  restoreDraft: boolean;
};

// 保存などの Server Action のあとはページが再取得されるため、初回保存で URL に作品 ID が付くと
// initialWork が変わる。編集中の作品そのものなら作り直さず、別の作品・テンプレートに移ったときだけ作り直す
export function EditorHost(props: EditorProps) {
  const incoming = `${props.template.slug}|${props.initialWork?.id ?? ""}`;
  const [prevIncoming, setPrevIncoming] = useState(incoming);
  const [editing, setEditing] = useState(incoming);
  const [generation, setGeneration] = useState(0);
  if (incoming !== prevIncoming) {
    setPrevIncoming(incoming);
    if (incoming !== editing) {
      setEditing(incoming);
      setGeneration((g) => g + 1);
    }
  }
  const onWorkId = useCallback((id: string) => setEditing(`${props.template.slug}|${id}`), [props.template.slug]);
  return <Editor key={generation} {...props} onWorkId={onWorkId} />;
}

function Editor({ template, gimmickDefs, userId, initialWork, restoreDraft, onWorkId }: EditorProps & { onWorkId: (id: string) => void }) {
  const router = useRouter();
  const initialState = useMemo<EditorState>(
    () => ({ params: initialWork?.params ?? defaultParams(template.slots), gimmicks: initialWork?.gimmicks ?? [] }),
    [initialWork, template.slots],
  );
  const initialName = initialWork?.name ?? `${template.name}の作品`;

  const history = useHistory<EditorState>(initialState);
  const { value: state, change: changeState, commit, undo, redo, reset } = history;
  const { params, gimmicks } = state;
  const change = useCallback(
    (update: (prev: EditorParams) => EditorParams, isCommit = true) =>
      changeState((prev) => {
        const next = update(prev.params);
        return next === prev.params ? prev : { ...prev, params: next };
      }, isCommit),
    [changeState],
  );
  const changeGimmicks = useCallback(
    (update: (prev: GimmickSelection[]) => GimmickSelection[], isCommit = true) =>
      changeState((prev) => ({ ...prev, gimmicks: update(prev.gimmicks) }), isCommit),
    [changeState],
  );
  const [name, setName] = useState(initialName);
  const [images, setImages] = useState<Record<string, LoadedImage>>({});
  const [workId, setWorkId] = useState<string | null>(initialWork?.id ?? null);
  const [savedImageIds, setSavedImageIds] = useState<Set<string>>(() => new Set(initialWork?.images.map((i) => i.id)));
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(initialName, initialState));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [loadingImages, setLoadingImages] = useState(Boolean(initialWork?.images.length) || restoreDraft);
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialWork?.updatedAt ?? null);
  const { ask: askKeepPrevious, dialog: keepPreviousDialog } = useKeepPreviousDialog();
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null);

  const dirty = snapshot(name, state) !== savedSnapshot;
  const readOnly = initialWork?.suspended ?? false;

  // 保存済みの作品の画像、またはログイン前に一時保存した編集内容を読み込む
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialWork?.images.length) {
          const loaded = await Promise.all(initialWork.images.map(fetchSavedImage));
          // 未保存の画像を消さないよう、既存の一覧に足す
          if (!cancelled) setImages((prev) => ({ ...Object.fromEntries(loaded.map((i) => [i.id, i])), ...prev }));
        } else if (restoreDraft) {
          const draft = await takeDraft(template.slug);
          if (draft && !cancelled) {
            const loaded = await Promise.all(draft.images.map((i) => loadImage(i.file, i.id)));
            setImages((prev) => ({ ...prev, ...Object.fromEntries(loaded.map((i) => [i.id, i])) }));
            setName(draft.name);
            reset({ params: draft.params, gimmicks: draft.gimmicks ?? [] });
          }
          window.history.replaceState(null, "", `/editor/${template.slug}`);
        }
      } catch {
        if (!cancelled) setStatus({ kind: "error", message: "保存した画像を読み込めませんでした。ページを再読み込みしてください。" });
      } finally {
        if (!cancelled) setLoadingImages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialWork, restoreDraft, template.slug, reset]);

  const changeSlot = useCallback(
    <T extends SlotParams>(key: string) =>
      (update: (prev: T) => T, isCommit = true) =>
        change((prev) => ({ ...prev, slots: { ...prev.slots, [key]: update(prev.slots[key] as T) } }), isCommit),
    [change],
  );

  const referencedImages = useCallback(
    (p: EditorParams) =>
      template.slots.flatMap((slot) => {
        const sp = p.slots[slot.key];
        const image = sp?.kind === "print" && sp.imageId ? images[sp.imageId] : undefined;
        return image ? [{ slot: slot.key, image }] : [];
      }),
    [template.slots, images],
  );

  const save = useCallback(async (): Promise<string | null> => {
    if (readOnly || status.kind === "saving" || loadingImages) return null;
    const used = referencedImages(params);

    if (!userId) {
      await saveDraft(template.slug, {
        name,
        params,
        gimmicks,
        images: used.map(({ image }) => ({ id: image.id, file: image.file })),
        savedAt: Date.now(),
      });
      router.push(`/login?next=${encodeURIComponent(`/editor/${template.slug}?draft=1`)}`);
      return null;
    }

    // 保存済みの作品を書き換える前に、前回の内容を別の作品として残すか確認する
    if (workId && dirty) {
      const previousName = (JSON.parse(savedSnapshot) as { name: string }).name;
      const choice = await askKeepPrevious(previousName, lastSavedAt);
      if (choice === "cancel") return null;
      if (choice === "keep") {
        setStatus({ kind: "saving" });
        const kept = await duplicateWork(workId, `${previousName}（${lastSavedAt ? formatSavedAt(lastSavedAt) : "前回"}の保存）`);
        if (!kept.ok) {
          setStatus({
            kind: "error",
            message: `前回の内容を残せなかったため、保存を中止しました（${kept.error}）。上書きしてよい場合は、もう一度保存して「上書き保存」を選んでください。`,
            limit: kept.error.includes("上限"),
          });
          return null;
        }
      }
    }

    setStatus({ kind: "saving" });
    const id = workId ?? crypto.randomUUID();
    // ページの再取得より先に「この ID の作品を編集中」と伝えておく
    onWorkId(id);
    try {
      await uploadImages(
        userId,
        id,
        used.filter(({ image }) => !savedImageIds.has(image.id)).map(({ image }) => image),
      );
      const thumbnail = await captureRef.current?.();
      const hasThumbnail = thumbnail ? await uploadThumbnail(userId, id, thumbnail) : false;

      const result = await saveWork({
        workId: id,
        templateId: template.id,
        name,
        params,
        gimmicks,
        images: used.map(({ slot, image }) => ({ id: image.id, slot, ext: imageExt(image), width: image.width, height: image.height })),
        hasThumbnail,
      });
      if (!result.ok) {
        if (result.code === "login_required") router.refresh();
        setStatus({ kind: "error", message: result.error, limit: result.code === "limit" });
        return null;
      }
      setWorkId(result.workId);
      setSavedImageIds(new Set(result.savedImageIds));
      setSavedSnapshot(snapshot(name.trim(), state));
      setName(name.trim());
      setStatus({ kind: "saved", at: result.updatedAt });
      setLastSavedAt(result.updatedAt);
      if (!workId) window.history.replaceState(null, "", `/editor/${template.slug}?work=${result.workId}`);
      setSaveCount((n) => n + 1);
      return result.workId;
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "保存に失敗しました。" });
      return null;
    }
  }, [readOnly, status.kind, loadingImages, referencedImages, params, gimmicks, state, userId, template, name, router, workId, savedImageIds, dirty, savedSnapshot, lastSavedAt, askKeepPrevious, onWorkId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void save();
        return;
      }
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && ["text", "number"].includes((target as HTMLInputElement).type)) return;
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
  }, [undo, redo, save]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const onCaptureReady = useCallback((capture: () => Promise<Blob | null>) => {
    captureRef.current = capture;
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-4 lg:min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col sm:max-w-md">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            aria-label="作品名"
            disabled={readOnly}
            className="min-w-0 rounded-md border border-transparent px-2 py-0.5 text-xl font-bold text-brand hover:border-zinc-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <span className="px-2 text-xs text-zinc-500">テンプレート: {template.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SaveStatus status={status} dirty={dirty} saved={Boolean(workId)} />
          <Button type="button" onClick={() => void save()} disabled={readOnly || status.kind === "saving" || loadingImages} title="保存 (Ctrl+S)">
            {status.kind === "saving" ? "保存中…" : userId ? "保存" : "ログインして保存"}
          </Button>
        </div>
      </div>

      {keepPreviousDialog}

      {readOnly && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          この作品は運営により公開停止されているため、編集・保存できません。
        </p>
      )}

      <div className="grid flex-1 gap-6 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:min-h-0">
          <div className="relative h-[55vh] min-h-[320px] overflow-hidden rounded-xl border border-zinc-200 lg:h-auto lg:min-h-0 lg:flex-1">
            <Viewer
              modelUrl={template.previewModelUrl}
              slots={template.slots}
              params={params}
              images={images}
              resetViewSignal={resetViewSignal}
              onCaptureReady={onCaptureReady}
            />
            {loadingImages && (
              <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-white/90 px-3 py-1 text-xs text-zinc-600 shadow">
                画像を読み込み中…
              </div>
            )}
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

        <aside className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <fieldset disabled={readOnly} className="flex flex-col gap-6">
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
          </fieldset>

          <fieldset disabled={readOnly}>
            <GimmickPanel defs={gimmickDefs} selected={gimmicks} onChange={changeGimmicks} onCommit={commit} />
          </fieldset>

          {status.kind === "error" && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {status.message}
              {status.limit && (
                <Link href="/works" className="ml-1 font-semibold underline">
                  マイ作品を開く
                </Link>
              )}
            </p>
          )}

          <DownloadPanel
            tokenCost={template.tokenCost + gimmicks.reduce((sum, g) => sum + (gimmickDefs.find((d) => d.slug === g.slug)?.tokenCost ?? 0), 0)}
            workId={workId}
            loggedIn={Boolean(userId)}
            dirty={dirty}
            disabled={readOnly || loadingImages || status.kind === "saving"}
            saveCount={saveCount}
            onSave={save}
          />
        </aside>
      </div>
    </div>
  );
}

function SaveStatus({ status, dirty, saved }: { status: Status; dirty: boolean; saved: boolean }) {
  if (status.kind === "saving") return null;
  if (dirty) return <span className="text-xs text-amber-700">未保存の変更があります</span>;
  if (status.kind === "saved") return <span className="text-xs text-accent-dark">{timeFormat.format(new Date(status.at))} に保存しました</span>;
  if (saved) return <span className="text-xs text-zinc-500">保存済み</span>;
  return null;
}
