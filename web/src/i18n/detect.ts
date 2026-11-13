import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

// 最初に表示する言語を決める。利用者が選んだ言語（Cookie）→ アクセス元の国（日本なら日本語、ほかは英語）の順。
// country は Vercel が付ける x-vercel-ip-country。手元の開発環境のように国が分からないときは日本語にする
export function detectLocale({ cookie, country }: { cookie?: string | null; country?: string | null }): Locale {
  if (isLocale(cookie)) return cookie;
  if (country) return country.toUpperCase() === "JP" ? "ja" : "en";
  return DEFAULT_LOCALE;
}

// 検索エンジンやリンクのプレビューは、アクセス元で転送しない（転送すると日本語版が検索結果に載らなくなる）
export function isCrawler(userAgent: string | null | undefined) {
  return !userAgent || /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|discord|twitter|slack|line-poker/i.test(userAgent);
}
