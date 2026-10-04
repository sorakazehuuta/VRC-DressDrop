import "server-only";
import { z } from "zod";
import { parseEditorParams, type EditorParams } from "@/lib/templates/params";
import { slotsSchema, type Slot } from "@/lib/templates/schema";

export type PurchaseSnapshot = {
  templateSlug: string;
  templateName: string;
  slots: Slot[];
  params: EditorParams;
  images: Record<string, string>;
};

const snapshotSchema = z.object({
  templateSlug: z.string(),
  templateName: z.string(),
  slots: slotsSchema,
  params: z.unknown(),
  images: z.record(z.string(), z.string()).default({}),
});

// 古い購入（控えを残す前のもの）や壊れたデータは null
export function parseSnapshot(raw: unknown): PurchaseSnapshot | null {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data, params: parseEditorParams(parsed.data.params, parsed.data.slots) };
}
