"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteWork, duplicateWork, renameWork, type WorkActionResult } from "./actions";

export type WorkCardData = {
  id: string;
  name: string;
  suspended: boolean;
  updatedAt: string;
  templateName: string;
  editUrl: string;
  thumbnailUrl: string | null;
};

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });

export function WorkCard({ work, canDuplicate }: { work: WorkCardData; canDuplicate: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(work.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<WorkActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else after?.();
    });
  }

  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white ${pending ? "opacity-60" : ""}`}>
      <Link href={work.editUrl} className="relative block aspect-[4/3] bg-zinc-100">
        {work.thumbnailUrl ? (
          // 署名付き URL は1時間で切れるため、最適化キャッシュを通さず直接表示する
          // eslint-disable-next-line @next/next/no-img-element
          <img src={work.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-zinc-400">プレビューなし</span>
        )}
        {work.suspended && (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">公開停止中</span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renameWork(work.id, name), () => setEditing(false));
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              aria-label="作品名"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={pending} className="text-sm font-semibold text-accent-dark">
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setName(work.name);
                setEditing(false);
              }}
              className="text-sm text-zinc-500"
            >
              取消
            </button>
          </form>
        ) : (
          <Link href={work.editUrl} className="font-semibold text-brand hover:underline">
            {work.name}
          </Link>
        )}
        <p className="text-xs text-zinc-500">
          {work.templateName}・{dateFormat.format(new Date(work.updatedAt))} 更新
        </p>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm">
          <Link href={work.editUrl} className="font-semibold text-accent-dark hover:underline">
            編集する
          </Link>
          <button type="button" disabled={pending} onClick={() => setEditing(true)} className="cursor-pointer text-zinc-600 hover:underline">
            名前を変更
          </button>
          <button
            type="button"
            disabled={pending || !canDuplicate}
            title={canDuplicate ? undefined : "保存できる作品数の上限に達しています"}
            onClick={() => run(() => duplicateWork(work.id))}
            className="cursor-pointer text-zinc-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            複製
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`「${work.name}」を削除します。アップロードした画像も削除され、元に戻せません。よろしいですか？`)) {
                run(() => deleteWork(work.id));
              }
            }}
            className="cursor-pointer text-red-600 hover:underline"
          >
            削除
          </button>
        </div>
      </div>
    </article>
  );
}
