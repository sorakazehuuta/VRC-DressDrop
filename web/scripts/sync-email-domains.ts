// 使い捨てメールアドレスのドメインの一覧を取得し、disposable_email_domains テーブルへ登録する（登録の拒否は DB のフックが行う）
//   npm run email-domains:check  … 取得して件数を確かめるだけ（Supabase には何もしない）
//   npm run email-domains:sync   … 登録。一覧から消えたドメインは削除する（運営が手で足したもの source=manual は残す）
// 一覧: https://github.com/disposable-email-domains/disposable-email-domains（CC0）
import { createClient } from "@supabase/supabase-js";

const LIST_URL = "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
// 一覧に誤って入っていたら、多くの利用者が登録できなくなるドメイン。入っていたら登録を中止する
const MUST_ALLOW = [
  "gmail.com", "googlemail.com", "yahoo.co.jp", "yahoo.com", "icloud.com", "me.com", "outlook.com", "outlook.jp", "hotmail.com", "live.jp",
  "docomo.ne.jp", "ezweb.ne.jp", "au.com", "softbank.ne.jp", "i.softbank.jp", "ymobile.ne.jp", "rakuten.jp", "nifty.com", "biglobe.ne.jp", "example.com",
];
const dryRun = process.argv.includes("--dry-run");
const CHUNK = 1000;

async function fetchList() {
  const res = await fetch(LIST_URL);
  if (!res.ok) throw new Error(`一覧を取得できませんでした（HTTP ${res.status}）`);
  const domains = new Set<string>();
  for (const line of (await res.text()).split(/\r?\n/)) {
    const d = line.trim().toLowerCase();
    if (!d || d.startsWith("#")) continue;
    if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(d)) throw new Error(`一覧に想定外の行があります: ${d}`);
    domains.add(d);
  }
  const wrong = MUST_ALLOW.filter((d) => domains.has(d));
  if (wrong.length) throw new Error(`一覧に通常のメールのドメインが入っています（${wrong.join(", ")}）。登録を中止しました`);
  if (domains.size < 1000) throw new Error(`一覧の件数が少なすぎます（${domains.size} 件）。取得に失敗した可能性があります`);
  return domains;
}

async function main() {
  const domains = await fetchList();
  console.log(`一覧: ${domains.size} 件`);
  if (dryRun) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください");
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  // 登録済みのもの（manual を list で上書きしないよう、両方とも読む）
  const existing = new Map<string, string>();
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await admin.from("disposable_email_domains").select("domain, source").order("domain").range(from, from + CHUNK - 1);
    if (error) throw error;
    for (const row of data) existing.set(row.domain, row.source);
    if (data.length < CHUNK) break;
  }

  const toAdd = [...domains].filter((d) => !existing.has(d));
  const toRemove = [...existing].filter(([d, source]) => source === "list" && !domains.has(d)).map(([d]) => d);

  for (let i = 0; i < toAdd.length; i += CHUNK) {
    const rows = toAdd.slice(i, i + CHUNK).map((domain) => ({ domain, source: "list" }));
    const { error } = await admin.from("disposable_email_domains").insert(rows);
    if (error) throw error;
  }
  for (let i = 0; i < toRemove.length; i += CHUNK) {
    const { error } = await admin.from("disposable_email_domains").delete().eq("source", "list").in("domain", toRemove.slice(i, i + CHUNK));
    if (error) throw error;
  }
  console.log(`追加 ${toAdd.length} 件、削除 ${toRemove.length} 件（登録済み ${existing.size - toRemove.length + toAdd.length} 件）`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
