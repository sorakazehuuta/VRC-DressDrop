import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// 未保存の変更があるまま、ブラウザの「戻る」やサイト内のリンクでエディタを離れようとしたときに確認する。
// サイト内の移動では beforeunload が働かないため、未保存の間だけ履歴に目印（同じ URL）を1つ積み、
// 「戻る」でその目印が外れたら確認を出す。目印は Next.js の履歴の情報（history.state）をそのまま引き継ぐ
const MARK = "__vrplGuard";

type Pending = { kind: "back" } | { kind: "link"; href: string };

export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const guarded = useRef(false); // 目印が履歴の一番上にある
  const dirtyRef = useRef(dirty);
  // 目印を外すために自分で戻ったあと、続けて行うこと（URL の書き換え・リンク先への移動）
  const afterPop = useRef<(() => void) | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty && !guarded.current) {
      window.history.pushState({ ...window.history.state, [MARK]: true }, "", window.location.href);
      guarded.current = true;
    }
  }, [dirty]);

  // 目印を外す（自分で1つ戻る）。外したあとに then を行う
  const dropMark = useCallback((then: () => void) => {
    if (!guarded.current) return then();
    guarded.current = false;
    afterPop.current = then;
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const then = afterPop.current;
      if (then) {
        afterPop.current = null;
        then();
        return;
      }
      if (!guarded.current || (window.history.state as Record<string, unknown> | null)?.[MARK]) return;
      // 利用者の「戻る」で目印が外れた
      guarded.current = false;
      if (dirtyRef.current) setPending({ kind: "back" });
      else window.history.back(); // 保存済みなら、そのまま前のページへ
    };
    // サイト内のリンク（新しいタブで開くもの・ページ内の移動は除く）
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: "link", href: url.pathname + url.search + url.hash });
    };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // 初回の保存で URL に作品 ID を付ける。目印があるときは外してから書き換える（戻ったときに作品 ID のない URL に戻らないように）
  const replaceUrl = useCallback(
    (url: string) => dropMark(() => window.history.replaceState({ ...window.history.state }, "", url)),
    [dropMark],
  );

  const go = useCallback(
    (p: Pending) => {
      if (p.kind === "back") window.history.back();
      else dropMark(() => router.push(p.href));
    },
    [dropMark, router],
  );

  // 編集を続ける。「戻る」で外れた目印を積み直す（リンクのときは目印が残っている）
  const keepEditing = useCallback(() => {
    if (dirtyRef.current && !guarded.current) {
      window.history.pushState({ ...window.history.state, [MARK]: true }, "", window.location.href);
      guarded.current = true;
    }
  }, []);

  // 確認ダイアログの答え
  const leave = useCallback(() => {
    const p = pending;
    setPending(null);
    if (p) go(p);
  }, [pending, go]);

  const stay = useCallback(() => {
    setPending(null);
    keepEditing();
  }, [keepEditing]);

  // 保存してから移動する。保存できなかった・やめたときは編集を続ける
  const saveAndLeave = useCallback(
    async (save: () => Promise<string | null>) => {
      const p = pending;
      setPending(null);
      if (!p) return;
      const saved = await save();
      if (!saved) return keepEditing();
      // 初回の保存で URL を書き換えている途中なら、終わるまで待つ
      for (let i = 0; i < 40 && afterPop.current; i++) await new Promise((r) => setTimeout(r, 25));
      go(p);
    },
    [pending, go, keepEditing],
  );

  // ダイアログを閉じるだけ（ログイン前の「ログインして保存」は、保存の処理がログイン画面へ移動する）
  const dismiss = useCallback(() => setPending(null), []);

  return { pending: pending !== null, leave, stay, saveAndLeave, dismiss, replaceUrl };
}
