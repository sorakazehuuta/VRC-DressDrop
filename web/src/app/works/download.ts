"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildWorkPackage } from "@/lib/package/work-package";
import { safeFileName } from "@/lib/package/unitypackage";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { parseEditorParams, type EditorParams } from "@/lib/templates/params";
import { slotsSchema } from "@/lib/templates/schema";
import { WORK_IMAGES_BUCKET } from "@/lib/works/constants";

const PACKAGES_BUCKET = "packages";
const URL_TTL_SECONDS = 5 * 60;

export type DownloadQuote =
  | { ok: true; purchased: true }
  | { ok: true; purchased: false; cost: number; balance: number }
  | { ok: false; error: string };

export type DownloadResult =
  | { ok: true; kind: "ready"; url: string; charged: number }
  | { ok: true; kind: "confirm"; cost: number; balance: number }
  | { ok: false; error: string; code?: "insufficient" };

// 購入済みかどうかの判定に使う「版」。テンプレートと編集内容（画像 ID を含む）が同じなら同じ版とみなす
function versionHash(templateId: string, params: EditorParams) {
  return createHash("sha256").update(JSON.stringify({ templateId, params })).digest("hex");
}

async function loadWork(workId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "ダウンロードするにはログインしてください。" } as const;

  const { data: work } = await supabase
    .from("works")
    .select("id, name, params, status, template_id, templates(id, slug, name, slots, token_cost, package_model_path), work_images(id, storage_path)")
    .eq("id", workId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!work) return { error: "作品が見つかりません。保存してからダウンロードしてください。" } as const;
  if (work.status === "suspended") return { error: "この作品は運営により公開停止されているため、ダウンロードできません。" } as const;

  const template = work.templates as unknown as {
    id: string;
    slug: string;
    name: string;
    slots: unknown;
    token_cost: number;
    package_model_path: string;
  };
  const slots = slotsSchema.parse(template.slots);
  const params = parseEditorParams(work.params, slots);
  const hash = versionHash(template.id, params);
  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, package_path")
    .eq("work_id", work.id)
    .eq("params_hash", hash)
    .maybeSingle();
  return { supabase, userId, work, template, slots, params, hash, purchase } as const;
}

async function balanceOf(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("get_token_balance");
  return (data as number | null) ?? 0;
}

export async function getDownloadQuote(workId: string): Promise<DownloadQuote> {
  const loaded = await loadWork(workId);
  if ("error" in loaded) return { ok: false, error: loaded.error as string };
  if (loaded.purchase) return { ok: true, purchased: true };
  return { ok: true, purchased: false, cost: loaded.template.token_cost, balance: await balanceOf(loaded.supabase) };
}

async function signedDownloadUrl(supabase: Awaited<ReturnType<typeof createClient>>, path: string, name: string) {
  const { data, error } = await supabase.storage
    .from(PACKAGES_BUCKET)
    .createSignedUrl(path, URL_TTL_SECONDS, { download: `${safeFileName(name, "VRPrintLab")}.unitypackage` });
  if (error || !data) return null;
  return data.signedUrl;
}

export async function downloadWork(workId: string, confirmed: boolean): Promise<DownloadResult> {
  const loaded = await loadWork(workId);
  if ("error" in loaded) return { ok: false, error: loaded.error as string };
  const { supabase, userId, work, template, slots, params, hash, purchase } = loaded;

  if (purchase?.package_path) {
    const url = await signedDownloadUrl(supabase, purchase.package_path, work.name);
    return url ? { ok: true, kind: "ready", url, charged: 0 } : { ok: false, error: "ダウンロード用のリンクを作れませんでした。" };
  }

  const cost = template.token_cost;
  const balance = await balanceOf(supabase);
  if (!confirmed) return { ok: true, kind: "confirm", cost, balance };
  if (balance < cost) return { ok: false, error: `トークンが足りません（必要: ${cost} / 残り: ${balance}）。`, code: "insufficient" };

  const admin = createAdminClient();
  const purchaseId = crypto.randomUUID();
  const packagePath = `${userId}/${purchaseId}.unitypackage`;

  try {
    const { data: model, error: modelError } = await admin.storage.from("template-packages").download(template.package_model_path);
    if (modelError || !model) throw new Error("model");
    const images = new Map<string, Buffer>();
    for (const img of work.work_images) {
      const { data, error } = await admin.storage.from(WORK_IMAGES_BUCKET).download(img.storage_path);
      if (error || !data) throw new Error("image");
      images.set(img.id, Buffer.from(await data.arrayBuffer()));
    }
    const file = await buildWorkPackage({
      purchaseId,
      workName: work.name,
      template: { slug: template.slug, name: template.name, slots },
      params,
      model: Buffer.from(await model.arrayBuffer()),
      images,
      createdAt: new Date(),
    });
    const { error: uploadError } = await admin.storage
      .from(PACKAGES_BUCKET)
      .upload(packagePath, file, { contentType: "application/octet-stream" });
    if (uploadError) throw new Error("upload");
  } catch {
    return { ok: false, error: "モデルの生成に失敗しました。時間をおいて再度お試しください。トークンは消費していません。" };
  }

  const { data: rows, error } = await admin.rpc("purchase_work_version", {
    p_user_id: userId,
    p_work_id: work.id,
    p_params_hash: hash,
    p_cost: cost,
    p_purchase_id: purchaseId,
    p_package_path: packagePath,
    p_work_name: work.name,
    p_template_name: template.name,
  });
  const result = (rows as { purchase_id: string; charged: number }[] | null)?.[0];
  if (error || !result) {
    await admin.storage.from(PACKAGES_BUCKET).remove([packagePath]);
    if (error?.message.includes("insufficient_tokens")) {
      return { ok: false, error: "トークンが足りません。", code: "insufficient" };
    }
    return { ok: false, error: "ダウンロードの処理に失敗しました。トークンは消費していません。" };
  }

  // 同時に押された場合などで既存の購入が返ってきたら、今回作ったファイルは不要
  let finalPath = packagePath;
  if (result.purchase_id !== purchaseId) {
    await admin.storage.from(PACKAGES_BUCKET).remove([packagePath]);
    const { data: existing } = await supabase.from("purchases").select("package_path").eq("id", result.purchase_id).single();
    finalPath = existing?.package_path ?? packagePath;
  }

  revalidatePath("/", "layout");
  const url = await signedDownloadUrl(supabase, finalPath, work.name);
  return url
    ? { ok: true, kind: "ready", url, charged: result.charged }
    : { ok: false, error: "購入は完了しました。ダウンロード履歴から再ダウンロードしてください。" };
}

export async function purchaseDownloadUrl(purchaseId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("purchases").select("package_path, work_name").eq("id", purchaseId).maybeSingle();
  if (!data?.package_path) return { ok: false, error: "ダウンロードできるファイルが見つかりません。" };
  const url = await signedDownloadUrl(supabase, data.package_path, data.work_name || "VRPrintLab");
  return url ? { ok: true, url } : { ok: false, error: "ダウンロード用のリンクを作れませんでした。" };
}
