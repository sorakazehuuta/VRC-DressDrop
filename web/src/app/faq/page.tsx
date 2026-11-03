import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";

export const metadata: Metadata = { title: "よくある質問 | VRPrintLab" };

export default async function FaqPage() {
  return (
    <DocumentPage>
      <Markdown source={await readContent("faq.md")} />
    </DocumentPage>
  );
}
