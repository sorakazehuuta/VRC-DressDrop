-- 公開前のデータの扱いの見直し
-- - Storage の削除キュー（削除に失敗したファイルを記録して再試行する）
-- - 退会後も取引の記録（支払い・トークンの履歴・ダウンロードの記録）を残す
-- - 購入した版の控えを版ごとに削除できるようにする
-- - 画像の中身のハッシュで版を判定する（同じ画像を貼り直しても再課金しない）
-- - 管理者によるトークンの手動調整

-- ===== enum =====
alter type public.token_tx_reason add value if not exists 'account_deleted';  -- 退会で消した残高
alter type public.payment_status add value if not exists 'account_deleted';   -- 退会後に入金された支払い（付与せず返金する）

-- ===== Storage の削除キュー =====
-- 削除する前に記録し、成功したら done_at を入れる。DB の行（作品など）を消したあとでも、消すべきファイルを追跡できる。
-- prefix = true はフォルダごと（その下のファイルをすべて）消す
create table public.storage_deletions (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  prefix boolean not null default false,
  user_id uuid,                       -- 退会後も残すため外部キーにしない
  reason text not null,               -- work_deleted / image_replaced / snapshot_deleted / account_deleted
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  last_tried_at timestamptz,
  done_at timestamptz
);
create index storage_deletions_pending_idx on public.storage_deletions (created_at) where done_at is null;
alter table public.storage_deletions enable row level security;
create policy storage_deletions_admin_select on public.storage_deletions for select to authenticated using (public.is_admin());

-- ===== 退会後も残す記録 =====
-- auth.users の削除に連動して消えないよう、外部キーを外す（user_id の値は残す）
alter table public.payments drop constraint payments_user_id_fkey;
alter table public.token_lots drop constraint token_lots_user_id_fkey;
alter table public.token_transactions drop constraint token_transactions_user_id_fkey;
alter table public.purchases drop constraint purchases_user_id_fkey;

create table public.deleted_accounts (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);
alter table public.deleted_accounts enable row level security;
create policy deleted_accounts_admin_select on public.deleted_accounts for select to authenticated using (public.is_admin());

-- ===== 購入した版の控えの削除 =====
-- 控え（パッケージ・元画像のコピー・サムネイル）を消した日時。購入の記録（日時・トークン数・編集内容）は残す
alter table public.purchases add column snapshot_deleted_at timestamptz;

-- ===== 画像の中身のハッシュ =====
-- SHA-256（16進）。版の判定に画像 ID の代わりに使う。既存の画像は scripts/backfill-image-hashes.ts で埋める
alter table public.work_images add column content_hash text;

-- ===== 退会の前処理 =====
-- 残っているトークンを 0 にして記録し、控えを削除済みにする（ファイルの削除はサーバーが削除キューで行う）。
-- コンビニの支払い待ちがある場合は payment_pending を投げる。何度呼んでもよい
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  lot record;
begin
  if exists (select 1 from public.payments where user_id = p_user_id and status = 'awaiting_payment') then
    raise exception 'payment_pending';
  end if;

  perform public.expire_token_lots(p_user_id);
  for lot in
    select id, remaining from public.token_lots where user_id = p_user_id and remaining > 0 for update
  loop
    update public.token_lots set remaining = 0 where id = lot.id;
    insert into public.token_transactions (user_id, delta, reason, lot_id, note)
    values (p_user_id, -lot.remaining, 'account_deleted', lot.id, '退会');
  end loop;

  update public.purchases
  set package_path = null,
      thumbnail_path = null,
      snapshot = case when snapshot is null then null else snapshot - 'images' end,
      snapshot_deleted_at = coalesce(snapshot_deleted_at, now())
  where user_id = p_user_id;

  insert into public.deleted_accounts (user_id) values (p_user_id) on conflict (user_id) do nothing;
end;
$$;

-- ===== 決済の完了: 退会後に入金された支払いには付与しない =====
create or replace function public.complete_token_payment(
  p_payment_id uuid,
  p_payment_intent_id text,
  p_payment_method_type text,
  p_card_fingerprint text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  pay record;
  debt integer;
  offset_amount integer;
  new_lot_id uuid;
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;
  if pay.status in ('completed', 'refunded', 'disputed', 'blocked', 'account_deleted') then
    return pay.status::text;
  end if;

  update public.payments
  set stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
      payment_method_type = p_payment_method_type,
      card_fingerprint = p_card_fingerprint
  where id = p_payment_id;

  -- 退会したアカウントの支払い（呼び出し側で返金する）
  if not exists (select 1 from public.profiles where id = pay.user_id) then
    update public.payments set status = 'account_deleted', konbini_voucher_url = null where id = p_payment_id;
    return 'account_deleted';
  end if;

  if p_card_fingerprint is not null and exists (select 1 from public.blocked_cards where card_fingerprint = p_card_fingerprint) then
    update public.payments set status = 'blocked' where id = p_payment_id;
    return 'blocked';
  end if;

  select token_debt into debt from public.profiles where id = pay.user_id for update;
  offset_amount := least(coalesce(debt, 0), pay.tokens);

  insert into public.token_lots (user_id, amount, remaining, source, payment_id)
  values (pay.user_id, pay.tokens, pay.tokens - offset_amount, 'purchase', p_payment_id)
  returning id into new_lot_id;
  insert into public.token_transactions (user_id, delta, reason, lot_id, ref_id, note)
  values (pay.user_id, pay.tokens, 'purchase', new_lot_id, p_payment_id, pay.tokens || 'トークン（' || pay.amount_jpy || '円）');
  if offset_amount > 0 then
    update public.profiles set token_debt = token_debt - offset_amount where id = pay.user_id;
  end if;

  update public.payments
  set status = 'completed', completed_at = now(), lot_id = new_lot_id, konbini_voucher_url = null
  where id = p_payment_id;
  return 'completed';
end;
$$;

-- ===== 管理者によるトークンの手動調整 =====
-- p_delta > 0: 新しいトークン（有効期限180日）を付与する / p_delta < 0: 有効期限が近い順に減らす（足りなければ insufficient_tokens）。
-- 理由は必須。操作した管理者と、関係する購入・支払いの ID（p_ref_id）を履歴に残す
create or replace function public.admin_adjust_tokens(
  p_admin_id uuid,
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_ref_id uuid default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  new_lot_id uuid;
  rest integer := -p_delta;
  lot record;
  take integer;
  balance integer;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin) then
    raise exception 'not_admin';
  end if;
  if p_delta = 0 or abs(p_delta) > 1000 then
    raise exception 'invalid_delta';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;

  if p_delta > 0 then
    insert into public.token_lots (user_id, amount, remaining, source)
    values (p_user_id, p_delta, p_delta, 'admin')
    returning id into new_lot_id;
    insert into public.token_transactions (user_id, delta, reason, lot_id, ref_id, note, created_by)
    values (p_user_id, p_delta, 'admin_adjust', new_lot_id, p_ref_id, trim(p_reason), p_admin_id);
    return p_delta;
  end if;

  perform public.expire_token_lots(p_user_id);
  select coalesce(sum(remaining), 0) into balance
  from public.token_lots where user_id = p_user_id and remaining > 0 and expires_at > now();
  if balance < rest then
    raise exception 'insufficient_tokens';
  end if;
  for lot in
    select id, remaining from public.token_lots
    where user_id = p_user_id and remaining > 0 and expires_at > now()
    order by expires_at, created_at
    for update
  loop
    exit when rest = 0;
    take := least(lot.remaining, rest);
    update public.token_lots set remaining = remaining - take where id = lot.id;
    insert into public.token_transactions (user_id, delta, reason, lot_id, ref_id, note, created_by)
    values (p_user_id, -take, 'admin_adjust', lot.id, p_ref_id, trim(p_reason), p_admin_id);
    rest := rest - take;
  end loop;
  return p_delta;
end;
$$;

-- ===== 管理画面のユーザー検索 =====
-- メールアドレス・表示名の部分一致、またはユーザー ID の完全一致。空なら新しい順
create or replace function public.admin_search_users(p_query text)
returns table (id uuid, email text, display_name text, status text, is_admin boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, p.display_name, p.status, p.is_admin, u.created_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where coalesce(trim(p_query), '') = ''
     or u.email ilike '%' || trim(p_query) || '%'
     or p.display_name ilike '%' || trim(p_query) || '%'
     or u.id::text = trim(p_query)
  order by u.created_at desc
  limit 50;
$$;

revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke execute on function public.complete_token_payment(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_tokens(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.admin_search_users(text) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.complete_token_payment(uuid, text, text, text) to service_role;
grant execute on function public.admin_adjust_tokens(uuid, uuid, integer, text, uuid) to service_role;
grant execute on function public.admin_search_users(text) to service_role;
