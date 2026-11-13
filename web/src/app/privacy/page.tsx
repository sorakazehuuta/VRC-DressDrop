import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";
import { getMessages } from "@/i18n/server";
import { documentMessages } from "../document-messages";
import { legalNotice } from "../legal-notice";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(documentMessages)).titles.privacy} | VRPrintLab` };
}

export default async function PrivacyPage() {
  const m = await getMessages(documentMessages);
  return (
    <DocumentPage notice={legalNotice(m.titles.privacy, m)}>
      <Markdown source={await readContent("privacy.md")} />
    </DocumentPage>
  );
}
