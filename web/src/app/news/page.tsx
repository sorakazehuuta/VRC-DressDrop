import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";

export const metadata: Metadata = { title: "お知らせ | VRPrintLab" };

export default async function NewsPage() {
  return (
    <DocumentPage>
      <Markdown source={await readContent("news.md")} />
    </DocumentPage>
  );
}
