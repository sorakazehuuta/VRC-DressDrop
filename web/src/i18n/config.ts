// 表示する言語。日本語は今の URL のまま、英語は /en を先頭に付けた URL で表示する（proxy が /en を外してページに振り替える）
export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ja";

// 利用者が言語を選んだときに保存する Cookie。アクセス元の国より優先する
export const LOCALE_COOKIE = "lang";
// proxy からページへ、表示する言語と言語を除いたパスを伝えるヘッダー
export const LOCALE_HEADER = "x-locale";
export const PATH_HEADER = "x-pathname";

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

// 言語を付けないパス（API・認証の受け口）。このファイルはブラウザ側でも読み込むので、
// 管理画面の URL はここに書かない（管理画面に言語を付けない扱いは proxy.ts だけで行う）
const UNLOCALIZED = ["/api", "/auth"];
export const isLocalizable = (path: string) => !UNLOCALIZED.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

// /en/works → { locale: "en", path: "/works" }、/works → { locale: "ja", path: "/works" }
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  if (pathname === "/en" || pathname.startsWith("/en/")) return { locale: "en", path: pathname.slice(3) || "/" };
  return { locale: DEFAULT_LOCALE, path: pathname };
}

// サイト内のパス（クエリ付きでもよい）に言語を付ける。英語なら /en を先頭に足す
export function localePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE || !path.startsWith("/") || path.startsWith("//") || !isLocalizable(path)) return path;
  if (path === "/en" || path.startsWith("/en/") || path.startsWith("/en?")) return path;
  return path === "/" ? "/en" : path.startsWith("/?") || path.startsWith("/#") ? `/en${path.slice(1)}` : `/en${path}`;
}
