import type { Metadata } from "next";
import { DocumentPage } from "@/components/document-page";
import { Markdown, readContent } from "@/components/markdown";
import { TERMS_DRAFT } from "@/lib/legal";

export const metadata: Metadata = { title: "プライバシーポリシー | VRPrintLab" };

export default async function PrivacyPage() {
  return (
    <DocumentPage notice={TERMS_DRAFT && "このプライバシーポリシーは確認用の下書きです。【要確認】の箇所は未確定です。"}>
      <Markdown source={await readContent("privacy.md")} />
    </DocumentPage>
  );
}
