import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// 未保存の変更があるまま、ブラウザの「戻る」やサイト内のリンクでエディタを離れようとしたときに確認する。
// サイト内の移動では beforeunload が働かないため、未保存の間だけ履歴に目印（同じ URL）を1つ積み、
// 「戻る」でその目印が外れたら確認を出す。
// 目印が外れたときの popstate は Next.js より先に受け取って止める（Next.js が前の履歴のページを描き直して、
// 編集中のエディタが作り直されないように）。そのときアドレスバーは前の履歴の URL になるので、今の URL に戻す
const MARK = "__vrplGuard";

type Pending = { kind: "back" } | { kind: "link"; href: string };

export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const guarded = useRef(false); // 目印が履歴の一番上にある
  const dirtyRef = useRef(dirty);
  const currentUrl = useRef<string | null>(null); // エディタの今の URL（目印を積んだあとに作品 ID が付いたときも追う）
  // 目印を外すために自分で戻ったあと、続けて行うこと（リンク先への移動）
  const afterPop = useRef<(() => void) | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const pushMark = useCallback(() => {
    currentUrl.current = window.location.href;
    window.history.pushState({ ...window.history.state, [MARK]: true }, "", window.location.href);
    guarded.current = true;
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty && !guarded.current) pushMark();
  }, [dirty, pushMark]);

  // 目印を外す（自分で1つ戻る）。外したあとに then を行う
  const dropMark = useCallback((then: () => void) => {
    if (!guarded.current) return then();
    afterPop.current = then;
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (!guarded.current) return;
      // 目印が外れた（利用者の「戻る」か、dropMark）。Next.js には渡さず、アドレスバーを今の URL に戻す
      e.stopImmediatePropagation();
      guarded.current = false;
      if (currentUrl.current && window.location.href !== currentUrl.current) {
        window.history.replaceState(window.history.state, "", currentUrl.current);
      }
      const then = afterPop.current;
      if (then) {
        afterPop.current = null;
        then();
        return;
      }
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
    // capture で登録して、Next.js の popstate の処理より先に受け取る
    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // 初回の保存で URL に作品 ID を付ける（Next.js にも URL の変化を伝えるため、state は null で渡す）
  const replaceUrl = useCallback((url: string) => {
    window.history.replaceState(null, "", url);
    if (guarded.current) currentUrl.current = window.location.href;
  }, []);

  const go = useCallback(
    (p: Pending) => {
      if (p.kind === "back") window.history.back();
      else dropMark(() => router.push(p.href));
    },
    [dropMark, router],
  );

  // 編集を続ける。「戻る」で外れた目印を積み直す（リンクのときは目印が残っている）
  const keepEditing = useCallback(() => {
    if (dirtyRef.current && !guarded.current) pushMark();
  }, [pushMark]);

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
      go(p);
    },
    [pending, go, keepEditing],
  );

  // ダイアログを閉じるだけ（ログイン前の「ログインして保存」は、保存の処理がログイン画面へ移動する）
  const dismiss = useCallback(() => setPending(null), []);

  return { pending: pending !== null, leave, stay, saveAndLeave, dismiss, replaceUrl };
}
