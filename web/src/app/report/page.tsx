import type { Metadata } from "next";
import Link from "next/link";
import { DocumentPage } from "@/components/document-page";
import { ReportForm } from "./form";

export const metadata: Metadata = { title: "通報 | VRPrintLab" };

export default function ReportPage() {
  return (
    <DocumentPage>
      <h1 className="text-2xl font-bold text-brand">権利侵害・不適切な作品の通報</h1>
      <p className="text-sm leading-relaxed text-zinc-700">
        VRPrintLab で作られた作品（VRChat のワールドに置かれたもの、販売・配布されているものなど）が、他人の権利を侵害している、または不適切な内容だと思われる場合は、こちらからお知らせください。ログインしなくても送れます。
      </p>
      <p className="text-sm leading-relaxed text-zinc-700">
        運営が内容を確認し、
        <Link href="/terms" className="underline">
          利用規約
        </Link>
        に違反している場合は、作品のダウンロードの停止やアカウントの停止などを行います。VRChat 上のワールドそのものの削除は、VRChat への報告が必要です。
      </p>
      <ReportForm />
    </DocumentPage>
  );
}
