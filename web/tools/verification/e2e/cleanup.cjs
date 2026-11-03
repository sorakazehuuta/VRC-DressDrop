// テスト用ユーザーの後片付け。Storage のファイル、退会後も残る記録（外部キーを外した表）、ユーザー本体を消す
async function removePrefix(admin, bucket, prefix) {
  const { data: entries } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  const files = [];
  for (const e of entries || []) {
    if (e.id) files.push(`${prefix}/${e.name}`);
    else await removePrefix(admin, bucket, `${prefix}/${e.name}`);
  }
  if (files.length) await admin.storage.from(bucket).remove(files);
}

async function cleanupUser(admin, uid) {
  for (const bucket of ["work-images", "packages"]) await removePrefix(admin, bucket, uid);
  const { error } = await admin.auth.admin.deleteUser(uid);
  await admin.from("token_transactions").delete().eq("user_id", uid);
  await admin.from("payments").update({ lot_id: null }).eq("user_id", uid);
  await admin.from("token_lots").delete().eq("user_id", uid);
  await admin.from("payments").delete().eq("user_id", uid);
  await admin.from("purchases").delete().eq("user_id", uid);
  await admin.from("storage_deletions").delete().eq("user_id", uid);
  await admin.from("deleted_accounts").delete().eq("user_id", uid);
  // 退会済みなら auth.users の削除は失敗するが、記録の削除はできているので問題ない
  return { error: error && !/not found/i.test(error.message) ? error : null };
}

module.exports = { cleanupUser };
