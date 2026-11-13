import { defineMessages } from "@/i18n/messages";

// 文書のページ（お知らせ・ガイド・FAQ・規約類）の見出しと注記。本文は content/*.md（英語版は content/en/*.md）
export const documentMessages = defineMessages({
  ja: {
    titles: {
      news: "お知らせ",
      guide: "導入ガイド",
      faq: "よくある質問",
      terms: "利用規約",
      privacy: "プライバシーポリシー",
      tokushoho: "特定商取引法に基づく表記",
    },
    draft: (doc: string) => `この${doc}は確認用の下書きです。【要確認】の箇所は未確定です。`,
    // 英語版だけに出す（日本語版では出さない）
    translationNote: "",
  },
  en: {
    titles: {
      news: "News",
      guide: "Setup Guide",
      faq: "FAQ",
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      tokushoho: "Legal Notice under the Act on Specified Commercial Transactions",
    },
    draft: (doc: string) => `This ${doc} is a draft for review. Sections marked 【TBD】 have not been finalized.`,
    translationNote:
      "This English version is provided for reference only. The Japanese version is the official text, and it prevails if there is any difference between the two.",
  },
});
