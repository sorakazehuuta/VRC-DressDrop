import type { ReactNode } from "react";
import { TERMS_DRAFT } from "@/lib/legal";
import type { documentMessages } from "./document-messages";

type DocumentMessages = (typeof documentMessages)["ja"];

// 規約類のページの上に出す注記（確認用の下書きであること、英語版は参考訳であること）。どちらもなければ出さない
export function legalNotice(title: string, m: DocumentMessages): ReactNode {
  const notes = [TERMS_DRAFT ? m.draft(title) : "", m.translationNote].filter(Boolean);
  if (!notes.length) return null;
  return notes.map((note) => <p key={note}>{note}</p>);
}
