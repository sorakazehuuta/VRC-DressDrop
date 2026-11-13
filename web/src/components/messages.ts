import { defineMessages } from "@/i18n/messages";

// 全ページ共通の部分（レイアウト・ヘッダー・フッター・共通の部品）の文言
export const commonMessages = defineMessages({
  ja: {
    siteDescription: "画像を貼るだけで、VRChatに置ける展示用3Dモデルを作れるWebサービス",
    nav: {
      templates: "テンプレート",
      works: "マイ作品",
      downloads: "ダウンロード履歴",
      account: "アカウント",
      login: "ログイン",
      signup: "新規登録",
      tokens: (n: number) => `${n} トークン`,
      menu: "メニュー",
    },
    logout: {
      button: "ログアウト",
      title: "ログアウトしますか？",
      body: "保存していない編集内容がある場合は、先に保存してください。",
      cancel: "キャンセル",
      confirm: "ログアウトする",
    },
    footer: {
      label: "サイト情報",
      news: "お知らせ",
      guide: "導入ガイド",
      faq: "よくある質問",
      terms: "利用規約",
      privacy: "プライバシーポリシー",
      tokushoho: "特定商取引法に基づく表記",
    },
    terms: {
      // 「{action}すると、利用規約とプライバシーポリシーに同意したものとみなします。」
      before: (action: string) => `${action}すると、`,
      terms: "利用規約",
      and: "と",
      privacy: "プライバシーポリシー",
      after: "に同意したものとみなします。",
    },
    imagePending: (alt: string) => `画像準備中: ${alt}`,
    toBeConfirmed: "要確認",
  },
  en: {
    siteDescription: "Turn your images into 3D display props you can place in VRChat, right in your browser",
    nav: {
      templates: "Templates",
      works: "My Works",
      downloads: "Download History",
      account: "Account",
      login: "Log in",
      signup: "Sign up",
      tokens: (n: number) => `${n} ${Math.abs(n) === 1 ? "token" : "tokens"}`,
      menu: "Menu",
    },
    logout: {
      button: "Log out",
      title: "Log out?",
      body: "If you have unsaved changes, please save them first.",
      cancel: "Cancel",
      confirm: "Log out",
    },
    footer: {
      label: "Site information",
      news: "News",
      guide: "Setup Guide",
      faq: "FAQ",
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      tokushoho: "Legal Notice (Specified Commercial Transactions Act)",
    },
    terms: {
      before: (action: string) => `By ${action}, you agree to our `,
      terms: "Terms of Service",
      and: " and ",
      privacy: "Privacy Policy",
      after: ".",
    },
    imagePending: (alt: string) => `Image coming soon: ${alt}`,
    toBeConfirmed: "TBD",
  },
});
