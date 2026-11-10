"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// 開いたままのタブは自動では読み直さないため、別のタブで内容が変わったあとに戻ってきたら呼ぶ
export function useOnTabReturn(callback: () => void) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}

// タブに戻ったら、ページのデータを読み直す（入力中の状態を持たないページで使う）
export function RefreshOnTabReturn() {
  const router = useRouter();
  useOnTabReturn(() => router.refresh());
  return null;
}
