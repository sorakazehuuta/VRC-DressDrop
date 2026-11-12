// 利用規約の版。文面を変えたら日付を更新する（パッケージの LICENSE.txt にも書き込まれる）
export const TERMS_VERSION = "2026-11-12";
// 共同開発者の確認が終わるまでは true。ページと LICENSE.txt に「確認用」と表示する
export const TERMS_DRAFT = true;

export const termsVersionLabel = () => `${TERMS_VERSION} 版${TERMS_DRAFT ? "（確認用・未確定）" : ""}`;

// 本番のドメインが決まったら NEXT_PUBLIC_SITE_URL に設定する
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
