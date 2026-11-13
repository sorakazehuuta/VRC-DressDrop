import type { Locale } from "./config";

// 画面ごとの文言を、日本語と英語を並べて書く。英語は日本語と同じ形でないと型チェックで失敗する（片方だけの更新を防ぐ）
export function defineMessages<T>(messages: { ja: T; en: NoInfer<T> }) {
  return messages;
}

export type Messages<T> = { ja: T; en: T };

export const pick = <T>(messages: Messages<T>, locale: Locale): T => messages[locale];
