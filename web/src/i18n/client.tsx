"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, localePath, splitLocale, type Locale } from "./config";
import { pick, type Messages } from "./messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

export function useMessages<T>(messages: Messages<T>): T {
  return pick(messages, useLocale());
}

// サイト内のパスに、表示している言語を付ける関数
export function useLocalePath() {
  const locale = useLocale();
  return useCallback((path: string) => localePath(locale, path), [locale]);
}

// 言語を除いたパス（ナビゲーションの選択中の判定などに使う）
export function usePathWithoutLocale() {
  return splitLocale(usePathname()).path;
}
