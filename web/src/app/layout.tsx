import type { Metadata, Viewport } from "next";
import { M_PLUS_1 } from "next/font/google";
import { commonMessages } from "@/components/messages";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LocaleProvider } from "@/i18n/client";
import { localePath } from "@/i18n/config";
import { getLocale, getPathname } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { siteUrl } from "@/lib/legal";
import "./globals.css";

// サイト全体の書体（日本語と英語を 1 書体でまかなう）。日本語の文字は使う範囲だけ読み込まれる（unicode-range）
const mplus = M_PLUS_1({ subsets: ["latin"], weight: "variable", display: "swap", variable: "--font-mplus" });

export const viewport: Viewport = { themeColor: "#031e42", colorScheme: "light" };

// 日本語版と英語版の対応を検索エンジンに伝える（hreflang）。どちらの言語でもないときは日本語版
export async function generateMetadata(): Promise<Metadata> {
  const [locale, path] = await Promise.all([getLocale(), getPathname()]);
  return {
    metadataBase: new URL(siteUrl()),
    title: "VRPrintLab",
    applicationName: "VRPrintLab",
    description: pick(commonMessages, locale).siteDescription,
    alternates: {
      canonical: localePath(locale, path),
      languages: { ja: path, en: localePath("en", path), "x-default": path },
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`h-full antialiased ${mplus.variable}`}>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>
          <SiteHeader />
          {children}
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
