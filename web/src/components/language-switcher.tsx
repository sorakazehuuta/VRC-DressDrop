"use client";

import { usePathname } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, localePath, splitLocale, type Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/client";

const LABELS: Record<Locale, string> = { ja: "日本語", en: "English" };

// 選んだ言語を Cookie に保存して、同じページのその言語の URL を開き直す
// （ヘッダーなど共通部分の言語も切り替えるため、画面の中での移動ではなく読み込み直す）
export function LanguageSwitcher({ variant = "list", className = "" }: { variant?: "list" | "toggle"; className?: string }) {
  const current = useLocale();
  const pathname = usePathname();

  const switchTo = (locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const { path } = splitLocale(pathname);
    window.location.assign(`${localePath(locale, path)}${window.location.search}${window.location.hash}`);
  };

  // ヘッダー用: もう一方の言語だけを小さく出す
  if (variant === "toggle") {
    const other = LOCALES.find((l) => l !== current)!;
    return (
      <button
        type="button"
        lang={other}
        onClick={() => switchTo(other)}
        aria-label={other === "en" ? "Switch to English" : "日本語に切り替える"}
        className={`flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 ${className}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
        </svg>
        {other === "en" ? "EN" : "日本語"}
      </button>
    );
  }

  return (
    <div role="group" aria-label="Language / 言語" className={`flex items-center gap-1 text-xs ${className}`}>
      {LOCALES.map((locale, i) => (
        <span key={locale} className="flex items-center gap-1">
          {i > 0 && <span className="text-zinc-300">|</span>}
          <button
            type="button"
            lang={locale}
            aria-pressed={locale === current}
            onClick={() => locale !== current && switchTo(locale)}
            className={locale === current ? "font-semibold text-zinc-900" : "cursor-pointer text-zinc-500 hover:text-zinc-900 hover:underline"}
          >
            {LABELS[locale]}
          </button>
        </span>
      ))}
    </div>
  );
}
