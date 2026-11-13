import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";
import { getMessages } from "@/i18n/server";
import { documentMessages } from "../document-messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(documentMessages)).titles.guide} | VRPrintLab` };
}

export default async function GuidePage() {
  return (
    <DocumentPage>
      <Markdown source={await readContent("guide.md")} />
    </DocumentPage>
  );
}
