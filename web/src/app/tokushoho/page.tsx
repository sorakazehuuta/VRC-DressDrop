import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";

export const metadata: Metadata = { title: "特定商取引法に基づく表記 | VRPrintLab" };

// 文面は準備中。決まったら content/tokushoho.md に置き、利用規約と同じように表示する
export default function TokushohoPage() {
  return (
    <DocumentPage notice="このページは準備中です。">
      <h1 className="text-2xl font-bold text-brand">特定商取引法に基づく表記</h1>
    </DocumentPage>
  );
}
