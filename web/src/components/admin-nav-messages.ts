import "server-only";
import { defineMessages } from "@/i18n/messages";

// 管理画面へのリンクの文言。管理者以外に届くブラウザ用の JavaScript に含めないよう、
// 共通の文言（messages.ts。ブラウザ側でも読み込む）とは分けて、サーバーだけで読む
export const adminNavMessages = defineMessages({
  ja: { label: "管理画面" },
  en: { label: "Admin" },
});
