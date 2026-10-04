"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { gimmickMap, listGimmicks } from "@/lib/gimmicks/queries";
import { parseGimmickSelection, type GimmickDefinition, type GimmickSelection } from "@/lib/gimmicks/schema";
import { buildWorkPackage } from "@/lib/package/work-package";
import { safeFileName } from "@/lib/package/unitypackage";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { parseEditorParams, type EditorParams } from "@/lib/templates/params";
import { slotsSchema, type Slot } from "@/lib/templates/schema";
import { WORK_IMAGES_BUCKET } from "@/lib/works/constants";

const PACKAGES_BUCKET = "packages";
const URL_TTL_SECONDS = 5 * 60;

// 内訳の1行。paid は「この土台の版で購入済み」なら true（今回は消費しない）
export type CostLine = { label: string; cost: number; paid: boolean };

export type DownloadQuote =
  | { ok: true; purchased: true }
  | { ok: true; purchased: false; cost: number; balance: number; breakdown: CostLine[] }
  | { ok: false; error: string };

export type DownloadResult =
  | { ok: true; kind: "ready"; url: string; filename: string; charged: number }
  | { ok: true; kind: "confirm"; cost: number; balance: number; breakdown: CostLine[] }
  | { ok: false; error: string; code?: "insufficient" };

// 「土台の版」: テンプレートと見た目の編集内容（画像 ID を含む）。ギミックは含めない
function versionHash(templateId: string, params: EditorParams) {
  return createHash("sha256").update(JSON.stringify({ templateId, params })).digest("hex");
}

// ギミックまで含めた版。ギミックがなければ土台の版と同じ（ギミック導入前の購入と互換）
function fullVersionHash(baseHash: string, gimmicks: GimmickSelection[]) {
  if (gimmicks.length === 0) return baseHash;
  return createHash("sha256").update(JSON.stringify({ baseHash, gimmicks })).digest("hex");
}

async function loadWork(workId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "ダウンロードするにはログインしてください。" } as const;

  const { data: work } = await supabase
    .from("works")
    .select("id, name, params, gimmicks, status, template_id, thumbnail_path, templates(id, slug, name, slots, token_cost, package_model_path), work_images(id, storage_path)")
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
  const defs = gimmickMap(await listGimmicks());
  const gimmicks = parseGimmickSelection(work.gimmicks, defs);
  const baseHash = versionHash(template.id, params);
  const hash = fullVersionHash(baseHash, gimmicks);

  // 同じ土台の版の購入（ギミック導入前の購入は params_hash が土台の版と同じ）
  const { data: related } = await supabase
    .from("purchases")
    .select("id, params_hash, base_hash, gimmick_slugs, package_path")
    .eq("work_id", work.id)
    .or(`base_hash.eq.${baseHash},params_hash.eq.${baseHash}`);
  const purchase = (related ?? []).find((p) => p.params_hash === hash) ?? null;
  const basePaid = (related ?? []).length > 0;
  const paidSlugs = new Set((related ?? []).flatMap((p) => p.gimmick_slugs ?? []));
  const breakdown: CostLine[] = [
    { label: `${template.name}（モデル）`, cost: template.token_cost, paid: basePaid },
    ...gimmicks.map((g) => {
      const def = defs.get(g.slug) as GimmickDefinition;
      return { label: def.name, cost: def.tokenCost, paid: paidSlugs.has(g.slug) };
    }),
  ];
  const cost = breakdown.reduce((sum, line) => sum + (line.paid ? 0 : line.cost), 0);
  return { supabase, userId, work, template, slots, params, defs, gimmicks, baseHash, hash, purchase, breakdown, cost } as const;
}

async function balanceOf(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("get_token_balance");
  return (data as number | null) ?? 0;
}

export async function getDownloadQuote(workId: string): Promise<DownloadQuote> {
  const loaded = await loadWork(workId);
  if ("error" in loaded) return { ok: false, error: loaded.error as string };
  if (loaded.purchase) return { ok: true, purchased: true };
  return { ok: true, purchased: false, cost: loaded.cost, balance: await balanceOf(loaded.supabase), breakdown: loaded.breakdown };
}

const packageFileName = (name: string) => `${safeFileName(name, "VRPrintLab")}.unitypackage`;

async function signedDownloadUrl(supabase: Awaited<ReturnType<typeof createClient>>, path: string) {
  const { data, error } = await supabase.storage.from(PACKAGES_BUCKET).createSignedUrl(path, URL_TTL_SECONDS, { download: true });
  if (error || !data) return null;
  return data.signedUrl;
}

// ダウンロード履歴で「どんな内容を買ったか」を確認できるよう、版の控え（編集内容・画像・サムネイル）を残す。
// 失敗してもダウンロード自体は止めない
async function saveSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  s: {
    userId: string;
    purchaseId: string;
    template: { slug: string; name: string };
    slots: Slot[];
    params: EditorParams;
    images: Map<string, Buffer>;
    imageExt: Map<string, string>;
    workThumbnailPath: string | null;
    baseHash: string;
    gimmicks: { slug: string; name: string; params: GimmickSelection["params"] }[];
  },
) {
  try {
    const folder = `${s.userId}/${s.purchaseId}`;
    const bucket = admin.storage.from(PACKAGES_BUCKET);
    const imagePaths: Record<string, string> = {};
    for (const [id, data] of s.images) {
      const ext = s.imageExt.get(id) ?? "png";
      const path = `${folder}/${id}.${ext}`;
      const { error } = await bucket.upload(path, data, { contentType: ext === "png" ? "image/png" : "image/jpeg" });
      if (!error) imagePaths[id] = path;
    }
    let thumbnailPath: string | null = null;
    if (s.workThumbnailPath) {
      const { data } = await admin.storage.from(WORK_IMAGES_BUCKET).download(s.workThumbnailPath);
      if (data) {
        const path = `${folder}/thumbnail.jpg`;
        const { error } = await bucket.upload(path, Buffer.from(await data.arrayBuffer()), { contentType: "image/jpeg" });
        if (!error) thumbnailPath = path;
      }
    }
    await admin
      .from("purchases")
      .update({
        thumbnail_path: thumbnailPath,
        base_hash: s.baseHash,
        gimmick_slugs: s.gimmicks.map((g) => g.slug),
        snapshot: {
          templateSlug: s.template.slug,
          templateName: s.template.name,
          slots: s.slots,
          params: s.params,
          images: imagePaths,
          gimmicks: s.gimmicks,
        },
      })
      .eq("id", s.purchaseId);
  } catch {
    // 控えがなくても購入とダウンロードには影響しない
  }
}

export async function downloadWork(workId: string, confirmed: boolean): Promise<DownloadResult> {
  const loaded = await loadWork(workId);
  if ("error" in loaded) return { ok: false, error: loaded.error as string };
  const { supabase, userId, work, template, slots, params, defs, gimmicks, baseHash, hash, purchase, breakdown, cost } = loaded;

  if (purchase?.package_path) {
    const url = await signedDownloadUrl(supabase, purchase.package_path);
    return url ? { ok: true, kind: "ready", url, filename: packageFileName(work.name), charged: 0 } : { ok: false, error: "ダウンロード用のリンクを作れませんでした。" };
  }

  const balance = await balanceOf(supabase);
  // ギミックの設定値だけを変えた場合などは無料なので、確認せずに作り直す
  if (!confirmed && cost > 0) return { ok: true, kind: "confirm", cost, balance, breakdown };
  if (balance < cost) return { ok: false, error: `トークンが足りません（必要: ${cost} / 残り: ${balance}）。`, code: "insufficient" };

  const admin = createAdminClient();
  const purchaseId = crypto.randomUUID();
  const packagePath = `${userId}/${purchaseId}.unitypackage`;
  const images = new Map<string, Buffer>();
  const imageExt = new Map<string, string>();

  try {
    const { data: model, error: modelError } = await admin.storage.from("template-packages").download(template.package_model_path);
    if (modelError || !model) throw new Error("model");
    for (const img of work.work_images) {
      const { data, error } = await admin.storage.from(WORK_IMAGES_BUCKET).download(img.storage_path);
      if (error || !data) throw new Error("image");
      images.set(img.id, Buffer.from(await data.arrayBuffer()));
      imageExt.set(img.id, img.storage_path.endsWith(".png") ? "png" : "jpg");
    }
    const file = await buildWorkPackage({
      purchaseId,
      workName: work.name,
      template: { slug: template.slug, name: template.name, slots },
      params,
      gimmicks: gimmicks.map((g) => ({ def: defs.get(g.slug) as GimmickDefinition, params: g.params })),
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
  if (result.purchase_id === purchaseId) {
    // 次回の差額計算に使うので、控えとは別に確実に記録する
    await admin
      .from("purchases")
      .update({ base_hash: baseHash, gimmick_slugs: gimmicks.map((g) => g.slug) })
      .eq("id", purchaseId);
    await saveSnapshot(admin, {
      userId,
      purchaseId,
      template,
      slots,
      params,
      images,
      imageExt,
      workThumbnailPath: work.thumbnail_path,
      baseHash,
      gimmicks: gimmicks.map((g) => ({ slug: g.slug, name: (defs.get(g.slug) as GimmickDefinition).name, params: g.params })),
    });
  } else {
    await admin.storage.from(PACKAGES_BUCKET).remove([packagePath]);
    const { data: existing } = await supabase.from("purchases").select("package_path").eq("id", result.purchase_id).single();
    finalPath = existing?.package_path ?? packagePath;
  }

  revalidatePath("/", "layout");
  const url = await signedDownloadUrl(supabase, finalPath);
  return url
    ? { ok: true, kind: "ready", url, filename: packageFileName(work.name), charged: result.charged }
    : { ok: false, error: "購入は完了しました。ダウンロード履歴から再ダウンロードしてください。" };
}

export async function purchaseDownloadUrl(purchaseId: string): Promise<{ ok: true; url: string; filename: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "ログインしてください。" };
  // RLS でも本人の購入に限られるが、設定ミスに備えてここでも絞り込む
  const { data } = await supabase
    .from("purchases")
    .select("package_path, work_name")
    .eq("id", purchaseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.package_path) return { ok: false, error: "ダウンロードできるファイルが見つかりません。" };
  const url = await signedDownloadUrl(supabase, data.package_path);
  return url ? { ok: true, url, filename: packageFileName(data.work_name) } : { ok: false, error: "ダウンロード用のリンクを作れませんでした。" };
}
