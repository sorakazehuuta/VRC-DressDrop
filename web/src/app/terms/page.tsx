import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";
import { getLocale, getMessages } from "@/i18n/server";
import { documentMessages } from "../document-messages";
import { legalNotice } from "../legal-notice";
import { termsVersionLabel } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${(await getMessages(documentMessages)).titles.terms} | VRPrintLab` };
}

export default async function TermsPage() {
  const m = await getMessages(documentMessages);
  return (
    <DocumentPage notice={legalNotice(m.titles.terms, m)}>
      <Markdown source={await readContent("terms.md")} />
      <p className="mt-6 text-right text-xs text-zinc-500">{termsVersionLabel(await getLocale())}</p>
    </DocumentPage>
  );
}
