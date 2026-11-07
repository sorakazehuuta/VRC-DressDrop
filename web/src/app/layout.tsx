import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#031e42", colorScheme: "light" };

export const metadata: Metadata = {
  title: "VRPrintLab",
  applicationName: "VRPrintLab",
  description: "画像を貼るだけで、VRChatに置ける展示用3Dモデルを作れるWebサービス",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
