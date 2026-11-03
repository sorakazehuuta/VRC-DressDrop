import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";
import { TERMS_DRAFT } from "@/lib/legal";

export const metadata: Metadata = { title: "特定商取引法に基づく表記 | VRPrintLab" };

export default async function TokushohoPage() {
  return (
    <DocumentPage notice={TERMS_DRAFT && "この特定商取引法に基づく表記は確認用の下書きです。【要確認】の箇所は未確定です。"}>
      <Markdown source={await readContent("tokushoho.md")} />
    </DocumentPage>
  );
}
