import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// DB 関数のテスト用。.env.local の Supabase に、テスト用のユーザーとデータを作って確かめ、最後に消す
if (!process.env.SUPABASE_SECRET_KEY && existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !secret || !publishable) throw new Error(".env.local に Supabase の URL とキーを設定してください");

export const admin = createClient(url, secret, { auth: { persistSession: false } });

const PASSWORD = "TestPass-12345";
// Supabase の CAPTCHA を Turnstile のテスト用のシークレットキーで有効にしているとき、ダミーのトークンが通る（CAPTCHA が無効なら無視される）
const TEST_CAPTCHA_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const created: string[] = [];
const fingerprints: string[] = [];

export type TestUser = { id: string; email: string; client: SupabaseClient };

// ログインした状態のクライアント付きで作る（RLS の確認に使う）
export async function createUser(opts: { admin?: boolean } = {}): Promise<TestUser> {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  if (opts.admin) await admin.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
  const client = createClient(url!, publishable!, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD, options: { captchaToken: TEST_CAPTCHA_TOKEN } });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

let cakeId: string | null = null;
export async function createWork(userId: string) {
  cakeId ??= (await admin.from("templates").select("id").eq("is_public", true).limit(1).single()).data!.id as string;
  const { data, error } = await admin.from("works").insert({ user_id: userId, template_id: cakeId, name: "テストの作品" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

// 期限を指定してトークンを足す（daysLeft が負なら期限切れ）
export async function addLot(userId: string, amount: number, daysLeft: number) {
  const { data, error } = await admin
    .from("token_lots")
    .insert({ user_id: userId, amount, remaining: amount, source: "admin", expires_at: new Date(Date.now() + daysLeft * 86400000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function lots(userId: string) {
  const { data } = await admin.from("token_lots").select("id, amount, remaining, source, expires_at, payment_id").eq("user_id", userId).order("expires_at");
  return data ?? [];
}

export async function transactions(userId: string) {
  const { data } = await admin.from("token_transactions").select("delta, reason, lot_id, ref_id, note, created_by").eq("user_id", userId).order("created_at");
  return data ?? [];
}

// アプリの残高と同じ計算（有効なトークンの合計 - マイナス残高）
export async function balance(userId: string) {
  const now = new Date().toISOString();
  const valid = (await lots(userId)).filter((l) => l.remaining > 0 && l.expires_at > now).reduce((s, l) => s + l.remaining, 0);
  const { data } = await admin.from("profiles").select("token_debt").eq("id", userId).maybeSingle();
  return valid - (data?.token_debt ?? 0);
}

export function purchase(userId: string, workId: string, paramsHash: string, cost: number, purchaseId = randomUUID()) {
  return admin.rpc("purchase_work_version", {
    p_user_id: userId,
    p_work_id: workId,
    p_params_hash: paramsHash,
    p_cost: cost,
    p_purchase_id: purchaseId,
    p_package_path: `${userId}/${purchaseId}.unitypackage`,
    p_work_name: "テストの作品",
    p_template_name: "テスト",
  });
}

export async function createPayment(userId: string, tokens: number, amountJpy: number, status = "created") {
  const { data, error } = await admin.from("payments").insert({ user_id: userId, tokens, amount_jpy: amountJpy, status }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export function completePayment(paymentId: string, fingerprint: string | null = null) {
  if (fingerprint) fingerprints.push(fingerprint);
  return admin.rpc("complete_token_payment", {
    p_payment_id: paymentId,
    p_payment_intent_id: `pi_test_${paymentId}`,
    p_payment_method_type: fingerprint ? "card" : "konbini",
    p_card_fingerprint: fingerprint,
  });
}

export const newFingerprint = () => {
  const fp = `fp_test_${randomUUID()}`;
  fingerprints.push(fp);
  return fp;
};

// テストで作ったユーザーと、退会後も残る記録・ブロックしたカードを消す
export async function cleanup() {
  for (const id of created.splice(0)) {
    await admin.auth.admin.deleteUser(id);
    await admin.from("token_transactions").delete().eq("user_id", id);
    await admin.from("payments").update({ lot_id: null }).eq("user_id", id);
    await admin.from("token_lots").delete().eq("user_id", id);
    await admin.from("blocked_cards").delete().in("card_fingerprint", fingerprints);
    await admin.from("payments").delete().eq("user_id", id);
    await admin.from("purchases").delete().eq("user_id", id);
    await admin.from("storage_deletions").delete().eq("user_id", id);
    await admin.from("deleted_accounts").delete().eq("user_id", id);
    await admin.from("admin_actions").delete().eq("admin_id", id);
  }
  fingerprints.splice(0);
}
