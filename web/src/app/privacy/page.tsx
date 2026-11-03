import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";

export const metadata: Metadata = { title: "プライバシーポリシー | VRPrintLab" };

// 文面は準備中。決まったら content/privacy.md に置き、利用規約と同じように表示する
export default function PrivacyPage() {
  return (
    <DocumentPage notice="このページは準備中です。">
      <h1 className="text-2xl font-bold text-brand">プライバシーポリシー</h1>
    </DocumentPage>
  );
}
