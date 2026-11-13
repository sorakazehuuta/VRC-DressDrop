"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { downloadWork, getDownloadQuote, type CostLine, type DownloadQuote, type VersionKind } from "@/app/works/download";
import { useOnTabReturn } from "@/components/tab-return";
import { Button } from "@/components/ui";
import { useMessages } from "@/i18n/client";
import Link from "@/i18n/link";
import { saveFileFromUrl } from "@/lib/save-file";
import { editorMessages } from "./messages";

type Confirm = { workId: string; cost: number; balance: number; breakdown: CostLine[]; versionKind: VersionKind };


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
  const m = useMessages(editorMessages).download;
  const router = useRouter();
  const [quote, setQuote] = useState<DownloadQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; insufficient?: boolean } | null>(null);
  const [tabReturns, setTabReturns] = useState(0);
  useOnTabReturn(() => setTabReturns((n) => n + 1));

  // 保存済みの内容が取得済みかどうかを確認する（保存のたび・タブに戻るたびに更新）
  useEffect(() => {
    if (!workId) return;
    let cancelled = false;
    getDownloadQuote(workId).then((q) => {
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [workId, saveCount, tabReturns]);

  const purchased = !dirty && quote?.ok === true && quote.purchased;

  async function run(id: string, confirmed: boolean) {
    const result = await downloadWork(id, confirmed);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error, insufficient: result.code === "insufficient" });
      return;
    }
    if (result.kind === "confirm") {
      setConfirm({ workId: id, cost: result.cost, balance: result.balance, breakdown: result.breakdown, versionKind: result.versionKind });
      return;
    }
    await saveFileFromUrl(result.url, result.filename);
    setQuote({ ok: true, purchased: true });
    setMessage({
      kind: "ok",
      text: m.started(result.charged),
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
        <p className="font-medium text-accent-dark">{m.purchased}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p>
            {m.needed}
            <strong className="text-base">{!dirty && quote?.ok && !quote.purchased ? quote.cost : tokenCost}</strong>
            {!dirty && quote?.ok && !quote.purchased && quote.cost < tokenCost && (
              <span className="ml-1 text-xs text-accent-dark">{m.excludingOwned}</span>
            )}
            {quote?.ok && !quote.purchased && <span className="ml-2 text-xs text-zinc-500">{m.remaining(quote.balance)}</span>}
          </p>
          {!dirty && quote?.ok && !quote.purchased && (
            <p className="text-xs text-zinc-600">{quote.cost === 0 ? m.settingsOnly : m.versions[quote.versionKind]}</p>
          )}
          {dirty && workId && <p className="text-xs text-zinc-500">{m.checkAfterSave}</p>}
        </div>
      )}
      <Button type="button" onClick={() => void onClick()} disabled={disabled || busy}>
        {busy ? m.preparing : loggedIn ? (dirty || !workId ? m.saveAndDownload : m.download) : m.loginToDownload}
      </Button>
      <p className="text-xs text-zinc-500">
        {m.about1}
        <Link href="/guide" target="_blank" className="underline">
          {m.guide}
        </Link>
        {m.about2}
      </p>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-red-700" : "text-accent-dark"}>
          {message.text}
          {message.insufficient && (
            <Link href="/tokens" className="ml-1 font-semibold underline">
              {m.buyTokens}
            </Link>
          )}
        </p>
      )}

      {confirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="download-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-6 shadow-xl">
            <h2 id="download-confirm-title" className="text-lg font-bold text-brand">
              {m.confirmTitle}
            </h2>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{m.versions[confirm.versionKind]}</p>
            <ul className="flex flex-col gap-1 rounded-md bg-zinc-50 p-3 text-sm">
              {confirm.breakdown.map((line) => (
                <li key={line.label} className="flex justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="tabular-nums">{line.paid ? <span className="text-xs text-accent-dark">{m.owned}</span> : line.cost}</span>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt>{m.use}</dt>
              <dd className="text-right font-semibold tabular-nums">{confirm.cost}</dd>
              <dt>{m.balance}</dt>
              <dd className="text-right tabular-nums">{confirm.balance}</dd>
              <dt>{m.after}</dt>
              <dd className={`text-right font-semibold tabular-nums ${confirm.balance < confirm.cost ? "text-red-700" : ""}`}>
                {confirm.balance - confirm.cost}
              </dd>
            </dl>
            {confirm.balance < confirm.cost ? (
              <p className="text-sm text-red-700">{m.notEnough}</p>
            ) : (
              <p className="text-xs text-zinc-500">
                {m.reDownloadNote}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
                {m.cancel}
              </Button>
              <Button type="button" onClick={() => void onConfirm()} disabled={confirm.balance < confirm.cost} autoFocus>
                {m.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
