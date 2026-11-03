import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";
import { TERMS_DRAFT, termsVersionLabel } from "@/lib/legal";

export const metadata: Metadata = { title: "利用規約 | VRPrintLab" };

export default async function TermsPage() {
  return (
    <DocumentPage notice={TERMS_DRAFT && "この利用規約は確認用の下書きです。【要確認】の箇所は未確定です。"}>
      <Markdown source={await readContent("terms.md")} />
      <p className="mt-6 text-right text-xs text-zinc-500">{termsVersionLabel()}</p>
    </DocumentPage>
  );
}
