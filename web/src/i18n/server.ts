import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, localePath, PATH_HEADER, type Locale } from "./config";
import { pick, type Messages } from "./messages";

// proxy が付けたヘッダーから、表示している言語を読む（ページ・Server Action・Route Handler のどれでも使える）
export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get(LOCALE_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

// 言語を除いたパス（/en/works なら /works）
export async function getPathname() {
  return (await headers()).get(PATH_HEADER) ?? "/";
}

export async function getMessages<T>(messages: Messages<T>): Promise<T> {
  return pick(messages, await getLocale());
}

export async function localized(path: string) {
  return localePath(await getLocale(), path);
}

// 表示している言語のまま移動する
export async function redirectLocalized(path: string): Promise<never> {
  redirect(await localized(path));
}
