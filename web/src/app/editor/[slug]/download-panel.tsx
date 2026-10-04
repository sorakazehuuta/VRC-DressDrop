"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { downloadWork, getDownloadQuote, type CostLine, type DownloadQuote } from "@/app/works/download";
import { Button } from "@/components/ui";
import { saveFileFromUrl } from "@/lib/save-file";

type Confirm = { workId: string; cost: number; balance: number; breakdown: CostLine[] };

export function DownloadPanel({
  tokenCost,
  workId,
  loggedIn,
  dirty,
  disabled,
  saveCount,
  onSave,
}: {
  tokenCost: number;
  workId: string | null;
  loggedIn: boolean;
  dirty: boolean;
  disabled: boolean;
  saveCount: number;
  onSave: () => Promise<string | null>;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<DownloadQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; insufficient?: boolean } | null>(null);

  // 保存済みの内容が購入済みかどうかを確認する（保存のたびに更新）
  useEffect(() => {
    if (!workId) return;
    let cancelled = false;
    getDownloadQuote(workId).then((q) => {
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [workId, saveCount]);

  const purchased = !dirty && quote?.ok === true && quote.purchased;

  async function run(id: string, confirmed: boolean) {
    const result = await downloadWork(id, confirmed);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error, insufficient: result.code === "insufficient" });
      return;
    }
    if (result.kind === "confirm") {
      setConfirm({ workId: id, cost: result.cost, balance: result.balance, breakdown: result.breakdown });
      return;
    }
    await saveFileFromUrl(result.url, result.filename);
    setQuote({ ok: true, purchased: true });
    setMessage({
      kind: "ok",
      text: result.charged > 0 ? `${result.charged} トークンを使用しました。ダウンロードを開始します。` : "ダウンロードを開始します。",
    });
    if (result.charged > 0) router.refresh();
  }

  async function onClick() {
    setMessage(null);
    setBusy(true);
    try {
      const id = !workId || dirty ? await onSave() : workId;
      if (id) await run(id, false);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!confirm) return;
    const { workId: id } = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      await run(id, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-3 rounded-lg bg-zinc-100 p-4 text-sm">
      {purchased ? (
        <p className="font-medium text-accent-dark">この内容は購入済みです。何度でも無料でダウンロードできます。</p>
      ) : (
        <p>
          ダウンロードに必要なトークン:{" "}
          <strong className="text-base">{!dirty && quote?.ok && !quote.purchased ? quote.cost : tokenCost}</strong>
          {!dirty && quote?.ok && !quote.purchased && quote.cost < tokenCost && (
            <span className="ml-1 text-xs text-accent-dark">（購入済みの分を除く）</span>
          )}
          {quote?.ok && !quote.purchased && <span className="ml-2 text-xs text-zinc-500">（残り {quote.balance}）</span>}
        </p>
      )}
      <Button type="button" onClick={() => void onClick()} disabled={disabled || busy}>
        {busy ? "準備中…" : loggedIn ? (dirty || !workId ? "保存してダウンロード" : "ダウンロード") : "ログインしてダウンロード"}
      </Button>
      <p className="text-xs text-zinc-500">VRChat 用の unitypackage（PC / Quest 対応）をダウンロードします。</p>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-red-700" : "text-accent-dark"}>
          {message.text}
          {message.insufficient && (
            <Link href="/account" className="ml-1 font-semibold underline">
              トークンの残高を確認
            </Link>
          )}
        </p>
      )}

      {confirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="download-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-6 shadow-xl">
            <h2 id="download-confirm-title" className="text-lg font-bold text-brand">
              トークンを使ってダウンロード
            </h2>
            <ul className="flex flex-col gap-1 rounded-md bg-zinc-50 p-3 text-sm">
              {confirm.breakdown.map((line) => (
                <li key={line.label} className="flex justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="tabular-nums">{line.paid ? <span className="text-xs text-accent-dark">購入済み 0</span> : line.cost}</span>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt>使用するトークン</dt>
              <dd className="text-right font-semibold tabular-nums">{confirm.cost}</dd>
              <dt>現在の残高</dt>
              <dd className="text-right tabular-nums">{confirm.balance}</dd>
              <dt>ダウンロード後の残高</dt>
              <dd className={`text-right font-semibold tabular-nums ${confirm.balance < confirm.cost ? "text-red-700" : ""}`}>
                {confirm.balance - confirm.cost}
              </dd>
            </dl>
            {confirm.balance < confirm.cost ? (
              <p className="text-sm text-red-700">トークンが足りません。</p>
            ) : (
              <p className="text-xs text-zinc-500">
                一度ダウンロードした内容は、あとから何度でも無料でダウンロードできます。編集して内容を変えた場合は、新しくトークンが必要です。
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
                キャンセル
              </Button>
              <Button type="button" onClick={() => void onConfirm()} disabled={confirm.balance < confirm.cost} autoFocus>
                ダウンロードする
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
