import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";

export const metadata: Metadata = { title: "導入ガイド | VRPrintLab" };

export default async function GuidePage() {
  return (
    <DocumentPage>
      <Markdown source={await readContent("guide.md")} />
    </DocumentPage>
  );
}
