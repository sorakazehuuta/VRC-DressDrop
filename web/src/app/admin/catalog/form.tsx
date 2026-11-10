"use client";

import Link from "next/link";
import { useActionState, useState, type DragEvent } from "react";
import type { FormState } from "@/app/auth/actions";
import { Button, FormMessage } from "@/components/ui";

type Row = { id: string; slug: string; name: string; token_cost: number; is_public: boolean; name_reading?: string };

export function CatalogForm({
  rows,
  action,
  previewBase,
  saveLabel,
  orderNote,
}: {
  rows: Row[];
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  previewBase?: string;
  saveLabel: string;
  orderNote: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const rowKey = rows.map((r) => r.id).join(",");
  // 並び順は保存するまで画面の中だけで入れ替える。保存後に届いた新しい行の順番に合わせ直す
  const [order, setOrder] = useState({ key: rowKey, ids: rows.map((r) => r.id) });
  const ids = order.key === rowKey ? order.ids : rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted = ids.flatMap((id) => byId.get(id) ?? []);
  const reordered = ids.join(",") !== rowKey;
  const [dragging, setDragging] = useState<string | null>(null);

  const move = (id: string, to: number) => {
    const next = ids.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    setOrder({ key: rowKey, ids: next });
  };
  // ドラッグ中の行を、重ねた行の位置へ動かす
  const onDragOver = (e: DragEvent, overId: string) => {
    if (!dragging) return;
    e.preventDefault();
    if (dragging !== overId) move(dragging, ids.indexOf(overId));
  };

  return (
    <form action={formAction} className="flex flex-col">
      <input type="hidden" name="order" value={ids.join(",")} />
      <p className="pb-2 text-xs text-zinc-500">左の ⋮⋮ をドラッグするか ▲▼ で並べ替えられます。{orderNote}</p>
      {sorted.map((row, i) => (
        <div
          key={row.id}
          data-row={row.slug}
          onDragOver={(e) => onDragOver(e, row.id)}
          onDrop={(e) => e.preventDefault()}
          className={`flex flex-wrap items-center gap-3 border-t border-zinc-100 py-2 text-sm ${dragging === row.id ? "bg-zinc-100 opacity-60" : ""}`}
        >
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", row.id);
              setDragging(row.id);
            }}
            onDragEnd={() => setDragging(null)}
            title="ドラッグして並べ替え"
            className="cursor-grab select-none px-1 text-zinc-400 active:cursor-grabbing"
          >
            ⋮⋮
          </span>
          <span className="flex flex-col">
            <button type="button" onClick={() => move(row.id, i - 1)} disabled={i === 0} aria-label={`${row.name}を上へ`} className="px-1 text-xs leading-none text-zinc-500 hover:text-zinc-900 disabled:opacity-30">
              ▲
            </button>
            <button type="button" onClick={() => move(row.id, i + 1)} disabled={i === sorted.length - 1} aria-label={`${row.name}を下へ`} className="px-1 text-xs leading-none text-zinc-500 hover:text-zinc-900 disabled:opacity-30">
              ▼
            </button>
          </span>
          <span className="min-w-40 flex-1">
            {row.name} <span className="font-mono text-xs text-zinc-400">{row.slug}</span>
            {previewBase && (
              <Link href={`${previewBase}/${row.slug}`} className="ml-2 text-xs underline">
                エディタで確認
              </Link>
            )}
          </span>
          {row.name_reading !== undefined && (
            <label className="flex items-center gap-1">
              読み
              <input name={`nameReading:${row.id}`} defaultValue={row.name_reading} maxLength={100} placeholder="ひらがな" className="w-36 rounded border border-zinc-300 px-2 py-1" />
            </label>
          )}
          <label className="flex items-center gap-1">
            <input name={`tokenCost:${row.id}`} type="number" required min={0} max={100} step={1} defaultValue={row.token_cost} className="w-16 rounded border border-zinc-300 px-2 py-1 text-right" />
            トークン
          </label>
          <label className="flex items-center gap-1">
            <input name={`isPublic:${row.id}`} type="checkbox" defaultChecked={row.is_public} />
            公開
          </label>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        {reordered && <p className="text-sm text-amber-700">並び順を変えました。保存するとサイトに反映されます。</p>}
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "保存中…" : saveLabel}
        </Button>
      </div>
    </form>
  );
}
