"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import type { FormState } from "@/app/auth/actions";
import { reportCategories } from "@/lib/reports";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const MAX_REPORTS_PER_HOUR = 5;

const schema = z.object({
  category: z.enum(Object.keys(reportCategories) as [keyof typeof reportCategories, ...(keyof typeof reportCategories)[]], {
    message: "通報の種類を選んでください。",
  }),
  purchaseRef: z.string().trim().max(100),
  location: z.string().trim().max(500, "見かけた場所は500文字以内で入力してください。"),
  details: z.string().trim().min(10, "内容は10文字以上で入力してください。").max(1000, "内容は1000文字以内で入力してください。"),
  contactEmail: z.union([z.literal(""), z.email("連絡先のメールアドレスの形式が正しくありません。").max(254)]),
});

// 連続投稿の制限に使う。IP アドレスそのものは保存しない
async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.SUPABASE_SECRET_KEY ?? ""}:${ip}`).digest("hex");
}

export async function submitReport(_prev: FormState, formData: FormData): Promise<FormState> {
  // ボット対策の見えない欄。人は入力しない
  if (formData.get("website")) return { message: "通報を受け付けました。" };
  const parsed = schema.safeParse({
    category: formData.get("category"),
    purchaseRef: formData.get("purchaseRef") ?? "",
    location: formData.get("location") ?? "",
    details: formData.get("details") ?? "",
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容が正しくありません。" };
  const input = parsed.data;

  const admin = createAdminClient();
  const hash = await ipHash();
  const { count } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", hash)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= MAX_REPORTS_PER_HOUR) return { error: "短い時間に多くの通報が送られました。しばらく時間をおいてから再度お試しください。" };

  // 取得 ID（LICENSE.txt に書いてある ID）から購入した版と作品を探す。見つからなくても通報は受け付ける
  const ref = input.purchaseRef.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase();
  const { data: purchase } = ref ? await admin.from("purchases").select("id, work_id").eq("id", ref).maybeSingle() : { data: null };

  const { data: claims } = await (await createClient()).auth.getClaims();
  const { error } = await admin.from("reports").insert({
    category: input.category,
    reason: input.details,
    purchase_ref: input.purchaseRef || null,
    purchase_id: purchase?.id ?? null,
    work_id: purchase?.work_id ?? null,
    location: input.location || null,
    contact_email: input.contactEmail || null,
    reporter_id: claims?.claims.sub ?? null,
    ip_hash: hash,
  });
  if (error) return { error: "送信できませんでした。時間をおいて再度お試しください。" };
  return { message: "通報を受け付けました。内容を確認し、必要に応じて対応します。個別の結果はお知らせしないことがあります。" };
}
