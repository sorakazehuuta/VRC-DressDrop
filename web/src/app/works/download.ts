"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "@/i18n/server";
import { pick } from "@/i18n/messages";
import { gimmickMap, listGimmicks } from "@/lib/gimmicks/queries";
import { localizeGimmick, parseGimmickSelection, type GimmickDefinition, type GimmickSelection } from "@/lib/gimmicks/schema";
import { buildWorkPackage, packageBaseName, purchaseFileName } from "@/lib/package/work-package";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { parseEditorParams, type EditorParams } from "@/lib/templates/params";
import { localizedTemplateText } from "@/lib/templates/queries";
import { slotsSchema, type Slot } from "@/lib/templates/schema";
import { WORK_IMAGES_BUCKET } from "@/lib/works/constants";
import { priceVersion, versionKindOf, workVersions, type CostLine, type VersionKind } from "@/lib/works/versions";
import { worksMessages } from "./messages";

const PACKAGES_BUCKET = "packages";
const URL_TTL_SECONDS = 5 * 60;

export type { CostLine, VersionKind };

export type DownloadQuote =
  | { ok: true; purchased: true }
  | { ok: true; purchased: false; cost: number; balance: number; breakdown: CostLine[]; versionKind: VersionKind }
  | { ok: false; error: string };

export type DownloadResult =
  | { ok: true; kind: "ready"; url: string; filename: string; charged: number }
  | { ok: true; kind: "confirm"; cost: number; balance: number; breakdown: CostLine[]; versionKind: VersionKind }
  | { ok: false; error: string; code?: "insufficient" };

// 表示している言語のダウンロードの文言
async function downloadMessages() {
  const locale = await getLocale();
  return { locale, m: pick(worksMessages, locale).download, modelLabel: pick(worksMessages, locale).modelLabel };
}

async function accountSuspended(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("status").eq("id", userId).maybeSingle();
  return data?.status === "suspended";
}

async function loadWork(workId: string) {
  const { locale, m, modelLabel } = await downloadMessages();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: m.loginToDownload } as const;

  const { data: work } = await supabase
    .from("works")
    .select("id, name, params, gimmicks, status, template_id, thumbnail_path, templates(*), work_images(id, storage_path, content_hash)")
    .eq("id", workId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!work) return { error: m.workNotFound } as const;
  if (work.status === "suspended") return { error: m.workSuspended } as const;
  if (await accountSuspended(supabase, userId)) return { error: m.accountSuspended } as const;

  const template = work.templates as unknown as {
    id: string;
    slug: string;
    name: string;
    slots: unknown;
    token_cost: number;
    package_model_path: string;
    package_prefab_path: string | null;
    name_en?: string;
  } | null;
  if (!template) return { error: m.templateEnded } as const;
  const slots = slotsSchema.parse(template.slots);
  const params = parseEditorParams(work.params, slots);
  const defs = gimmickMap(await listGimmicks());
  const gimmicks = parseGimmickSelection(work.gimmicks, defs);
  // 新しい購入は画像の中身で計算した版で記録する。以前の購入（画像 ID で計算）とも一致すれば購入済みとする
  const contentHashes = new Map(
    work.work_images.flatMap((img) => (img.content_hash ? [[img.id, img.content_hash] as const] : [])),
  );
  const { baseHash, hash, baseHashes, fullHashes } = workVersions(template.id, params, contentHashes, gimmicks);

  // 同じ土台の版の購入（ギミック導入前の購入は params_hash が土台の版と同じ）
  const { data: related } = await supabase
    .from("purchases")
    .select("id, params_hash, base_hash, gimmick_slugs, package_path, package_name, created_at, suspended_at")
    .eq("work_id", work.id)
    .or(`base_hash.in.(${baseHashes.join(",")}),params_hash.in.(${baseHashes.join(",")})`);
  // 内訳の名前は表示している言語にする（パッケージと購入の記録は日本語の名前のまま）
  const { purchase, basePaid, breakdown, cost } = priceVersion({
    template: { name: localizedTemplateText(template, locale).name, tokenCost: template.token_cost },
    gimmicks: gimmicks.map((g) => localizeGimmick(defs.get(g.slug) as GimmickDefinition, locale)),
    related: related ?? [],
    fullHashes,
    modelLabel,
  });
  if (purchase?.suspended_at) return { error: m.purchaseSuspended } as const;
  const { count } = basePaid ? { count: 1 } : await supabase.from("purchases").select("id", { count: "exact", head: true }).eq("work_id", work.id);
  const versionKind = versionKindOf(basePaid, Boolean(count));
  return { supabase, userId, work, template, slots, params, defs, gimmicks, baseHash, hash, purchase, breakdown, cost, versionKind } as const;
}

async function balanceOf(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("get_token_balance");
  return (data as number | null) ?? 0;
}

export async function getDownloadQuote(workId: string): Promise<DownloadQuote> {
  const loaded = await loadWork(workId);
  if ("error" in loaded) return { ok: false, error: loaded.error as string };
  if (loaded.purchase) return { ok: true, purchased: true };
  const { cost, breakdown, versionKind } = loaded;
  return { ok: true, purchased: false, cost, balance: await balanceOf(loaded.supabase), breakdown, versionKind };
}

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
  const { m } = await downloadMessages();
  const loaded = await loadWork(workId);
  if ("error" in loaded) return { ok: false, error: loaded.error as string };
  const { supabase, userId, work, template, slots, params, defs, gimmicks, baseHash, hash, purchase, breakdown, cost, versionKind } = loaded;

  if (purchase?.package_path) {
    const url = await signedDownloadUrl(supabase, purchase.package_path);
    return url ? { ok: true, kind: "ready", url, filename: purchaseFileName(purchase), charged: 0 } : { ok: false, error: m.noLink };
  }

  // 控えを削除した取得済みの版は、今の作品から無料で作り直す（同じ購入 ID なので GUID も同じになる）
  const restoring = purchase !== null;
  if (!restoring) {
    const balance = await balanceOf(supabase);
    // ギミックの設定値だけを変えた場合などは無料なので、確認せずに作り直す
    if (!confirmed && cost > 0) return { ok: true, kind: "confirm", cost, balance, breakdown, versionKind };
    if (balance < cost) return { ok: false, error: m.notEnough(cost, balance), code: "insufficient" };
  }

  const admin = createAdminClient();
  const purchaseId = purchase?.id ?? crypto.randomUUID();
  const packageName = purchase?.package_name ?? packageBaseName(template.slug, purchase ? new Date(purchase.created_at) : new Date());
  // 作り直す場合は、削除キューに残っている以前のファイルと重ならないパスにする
  const packagePath = restoring ? `${userId}/${purchaseId}-${Date.now()}.unitypackage` : `${userId}/${purchaseId}.unitypackage`;
  const images = new Map<string, Buffer>();
  const imageExt = new Map<string, string>();

  // 以前の形式（FBX）のテンプレートは新しく作れない。購入済みの版は控えから再ダウンロードできる
  if (!template.package_prefab_path) return { ok: false, error: m.templateEndedNew };
  const prefabPath = template.package_prefab_path;

  try {
    const { data: templatePackage, error: packageError } = await admin.storage.from("template-packages").download(template.package_model_path);
    if (packageError || !templatePackage) throw new Error("template package");
    for (const img of work.work_images) {
      const { data, error } = await admin.storage.from(WORK_IMAGES_BUCKET).download(img.storage_path);
      if (error || !data) throw new Error("image");
      images.set(img.id, Buffer.from(await data.arrayBuffer()));
      imageExt.set(img.id, img.storage_path.endsWith(".png") ? "png" : "jpg");
    }
    const file = await buildWorkPackage({
      purchaseId,
      workName: work.name,
      packageName,
      template: { slug: template.slug, name: template.name, nameEn: template.name_en, slots, prefabPath },
      params,
      gimmicks: gimmicks.map((g) => ({ def: defs.get(g.slug) as GimmickDefinition, params: g.params })),
      templatePackage: Buffer.from(await templatePackage.arrayBuffer()),
      images,
      createdAt: new Date(),
    });
    const { error: uploadError } = await admin.storage
      .from(PACKAGES_BUCKET)
      .upload(packagePath, file, { contentType: "application/octet-stream" });
    if (uploadError) throw new Error("upload");
  } catch {
    return { ok: false, error: m.buildFailed };
  }

  if (restoring) {
    const { error } = await admin.from("purchases").update({ package_path: packagePath, package_name: packageName }).eq("id", purchaseId);
    if (error) return { ok: false, error: m.failed };
    const url = await signedDownloadUrl(supabase, packagePath);
    return url ? { ok: true, kind: "ready", url, filename: `${packageName}.unitypackage`, charged: 0 } : { ok: false, error: m.noLink };
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
    if (error?.message.includes("account_suspended")) {
      return { ok: false, error: m.accountSuspended };
    }
    if (error?.message.includes("insufficient_tokens")) {
      return { ok: false, error: m.notEnoughShort, code: "insufficient" };
    }
    return { ok: false, error: m.failedNoCharge };
  }

  // 同時に押された場合などで既存の購入が返ってきたら、今回作ったファイルは不要
  let finalPath = packagePath;
  let filename = `${packageName}.unitypackage`;
  if (result.purchase_id === purchaseId) {
    // 次回の差額計算に使うので、控えとは別に確実に記録する
    await admin
      .from("purchases")
      .update({ base_hash: baseHash, gimmick_slugs: gimmicks.map((g) => g.slug), package_name: packageName })
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
    const { data: existing } = await supabase.from("purchases").select("package_path, package_name, created_at").eq("id", result.purchase_id).single();
    finalPath = existing?.package_path ?? packagePath;
    if (existing) filename = purchaseFileName(existing);
  }

  revalidatePath("/", "layout");
  const url = await signedDownloadUrl(supabase, finalPath);
  return url
    ? { ok: true, kind: "ready", url, filename, charged: result.charged }
    : { ok: false, error: m.purchasedRetry };
}

export async function purchaseDownloadUrl(purchaseId: string): Promise<{ ok: true; url: string; filename: string } | { ok: false; error: string }> {
  const { m } = await downloadMessages();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: m.loginToDownload };
  // RLS でも本人の購入に限られるが、設定ミスに備えてここでも絞り込む
  const { data } = await supabase
    .from("purchases")
    .select("package_path, package_name, created_at, suspended_at")
    .eq("id", purchaseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.suspended_at) return { ok: false, error: m.purchaseSuspended };
  if (await accountSuspended(supabase, userId)) return { ok: false, error: m.accountSuspended };
  if (!data?.package_path) return { ok: false, error: m.fileNotFound };
  const url = await signedDownloadUrl(supabase, data.package_path);
  return url ? { ok: true, url, filename: purchaseFileName(data) } : { ok: false, error: m.noLink };
}
