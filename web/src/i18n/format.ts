import type { Locale } from "./config";

// 日付・数値の表示。時刻は日本時間で表示する（英語版も同じ。タイムゾーンを書き添える）
const LOCALE_TAGS: Record<Locale, string> = { ja: "ja-JP", en: "en-US" };
const TIME_ZONE = "Asia/Tokyo";

export function formatDate(locale: Locale, value: string | Date) {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeZone: TIME_ZONE }).format(new Date(value));
}

export function formatDateTime(locale: Locale, value: string | Date) {
  const text = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(value));
  return locale === "en" ? `${text} JST` : text;
}

export function formatNumber(locale: Locale, value: number) {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(value);
}
