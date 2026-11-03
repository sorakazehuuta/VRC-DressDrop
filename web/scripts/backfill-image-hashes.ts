// 画像の中身のハッシュ（work_images.content_hash）が未登録の画像に、ハッシュを登録する。
// 20261104000000_data_handling.sql を実行したあとに一度だけ実行する（何度実行してもよい）。
//   npm run images:backfill-hashes
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY を .env.local に設定してください");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: images, error } = await supabase.from("work_images").select("id, storage_path").is("content_hash", null);
  if (error) throw new Error(`画像の一覧を取得できません: ${error.message}`);

  let updated = 0;
  const failed: string[] = [];
  for (const image of images ?? []) {
    const { data, error: downloadError } = await supabase.storage.from("work-images").download(image.storage_path);
    if (downloadError || !data) {
      failed.push(`${image.storage_path}（${downloadError?.message ?? "ファイルがない"}）`);
      continue;
    }
    const hash = createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex");
    const { error: updateError } = await supabase.from("work_images").update({ content_hash: hash }).eq("id", image.id);
    if (updateError) failed.push(`${image.storage_path}（${updateError.message}）`);
    else updated++;
  }

  console.log(`ハッシュを登録: ${updated} 件 / 対象 ${images?.length ?? 0} 件`);
  if (failed.length) {
    console.log(`登録できなかった画像: ${failed.length} 件`);
    for (const f of failed) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
