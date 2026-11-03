-- Phase 7: Stripe でのトークン購入、有効期限切れの記録、返金・チャージバック
-- （要件定義書 6.7 / 6.8 / 6.11）

-- ===== enum =====
alter type public.token_tx_reason add value if not exists 'refund';      -- 返金で取り消した未使用分
alter type public.token_tx_reason add value if not exists 'chargeback';  -- チャージバックで取り消した分（使用済みはマイナス残高）
-- created: 決済画面を作った / awaiting_payment: コンビニの支払い待ち / completed: 付与済み
-- expired: 期限内に支払われなかった / blocked: 使えないカードだったため付与せず返金
-- disputed: チャージバックが起きた / failed・refunded は既存
alter type public.payment_status add value if not exists 'awaiting_payment';
alter type public.payment_status add value if not exists 'expired';
alter type public.payment_status add value if not exists 'blocked';
alter type public.payment_status add value if not exists 'disputed';

-- ===== profiles =====
-- status: チャージバックなどで停止したアカウントは購入・ダウンロードできない
-- token_debt: チャージバックで取り消せなかった使用済みトークン。残高 = 有効なトークンの合計 - token_debt
alter table public.profiles add column status text not null default 'active' check (status in ('active', 'suspended'));
alter table public.profiles add column token_debt integer not null default 0 check (token_debt >= 0);

-- ===== payments（PayPal 用の列を Stripe 用に置き換える。既存の行はない） =====
alter table public.payments drop column paypal_order_id;
alter table public.payments add column stripe_checkout_session_id text unique;
alter table public.payments add column stripe_payment_intent_id text unique;
alter table public.payments add column payment_method_type text;          -- card / konbini など
alter table public.payments add column card_fingerprint text;              -- カードの識別子（チャージバック時のブロックに使う）
alter table public.payments add column lot_id uuid references public.token_lots (id);
alter table public.payments add column konbini_voucher_url text;           -- コンビニの払込票（支払い待ちの間だけ表示する）
alter table public.payments add column konbini_expires_at timestamptz;
alter table public.payments add column updated_at timestamptz not null default now();
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create index payments_card_fingerprint_idx on public.payments (card_fingerprint) where card_fingerprint is not null;

-- ===== チャージバックが起きたカード =====
create table public.blocked_cards (
  card_fingerprint text primary key,
  payment_id uuid references public.payments (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.blocked_cards enable row level security;
create policy blocked_cards_admin_select on public.blocked_cards for select to authenticated using (public.is_admin());

-- ===== トークンのパック（価格は仮。管理画面ができるまでは SQL で変更する） =====
insert into public.token_packs (name, tokens, price_jpy, sort_order)
select * from (values ('5トークン', 5, 1000, 10), ('12トークン', 12, 2200, 20), ('30トークン', 30, 5000, 30)) as v(name, tokens, price_jpy, sort_order)
where not exists (select 1 from public.token_packs);

-- ===== 残高 =====
create or replace function public.get_token_balance()
returns integer language sql stable security invoker set search_path = '' as $$
  select (
    coalesce((select sum(remaining) from public.token_lots
              where user_id = auth.uid() and remaining > 0 and expires_at > now()), 0)
    - coalesce((select token_debt from public.profiles where id = auth.uid()), 0)
  )::integer;
$$;

-- ===== 有効期限切れの記録 =====
-- 期限が切れたのに残っているトークンを 0 にし、履歴に「有効期限切れ」を記録する。
-- p_user_id が null なら全員分。サーバーから残高・履歴の表示前と購入の前に呼ぶ
create or replace function public.expire_token_lots(p_user_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  lot record;
  n integer := 0;
begin
  for lot in
    select id, user_id, remaining from public.token_lots
    where remaining > 0 and expires_at <= now() and (p_user_id is null or user_id = p_user_id)
    for update
  loop
    update public.token_lots set remaining = 0 where id = lot.id;
    insert into public.token_transactions (user_id, delta, reason, lot_id, note)
    values (lot.user_id, -lot.remaining, 'expire', lot.id, '有効期限切れ');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ===== 決済の完了（トークンの付与） =====
-- 同じ支払いに何度呼んでも1回だけ付与する。チャージバックが起きたカードなら付与せず 'blocked' を返す（呼び出し側で返金する）。
-- マイナス残高（token_debt）があれば、付与した分から先に相殺する
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
  if pay.status in ('completed', 'refunded', 'disputed', 'blocked') then
    return pay.status::text;
  end if;

  update public.payments
  set stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
      payment_method_type = p_payment_method_type,
      card_fingerprint = p_card_fingerprint
  where id = p_payment_id;

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

-- ===== 返金・チャージバック =====
-- p_kind = 'refund': その支払いで付与したトークンのうち未使用の分を取り消す
-- p_kind = 'chargeback': 未使用の分を取り消し、使用済みの分はマイナス残高にする。カードをブロックし、アカウントを停止する
-- 取り消したトークン数（マイナス残高にした分を含む）を返す。同じ支払いに2回目以降は 0
create or replace function public.revoke_token_payment(p_payment_id uuid, p_kind text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  pay record;
  lot record;
  used integer := 0;
  unused integer := 0;
begin
  if p_kind not in ('refund', 'chargeback') then
    raise exception 'invalid_kind';
  end if;
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;

  if p_kind = 'chargeback' and pay.card_fingerprint is not null then
    insert into public.blocked_cards (card_fingerprint, payment_id, reason)
    values (pay.card_fingerprint, p_payment_id, 'chargeback')
    on conflict (card_fingerprint) do nothing;
  end if;
  if p_kind = 'chargeback' then
    update public.profiles set status = 'suspended' where id = pay.user_id;
  end if;

  if pay.status <> 'completed' then
    -- 付与していない支払いは状態だけを変える。ブロックしたカードの自動返金（blocked）と、取り消し済みの支払いはそのまま
    if pay.status not in ('refunded', 'disputed', 'blocked') then
      update public.payments
      set status = (case when p_kind = 'refund' then 'refunded' else 'disputed' end)::public.payment_status
      where id = p_payment_id;
    end if;
    return 0;
  end if;

  perform public.expire_token_lots(pay.user_id);
  select * into lot from public.token_lots where id = pay.lot_id for update;
  if found then
    unused := lot.remaining;
    select coalesce(-sum(delta), 0) into used from public.token_transactions where lot_id = lot.id and reason = 'consume';
    if unused > 0 then
      update public.token_lots set remaining = 0 where id = lot.id;
      insert into public.token_transactions (user_id, delta, reason, lot_id, ref_id, note)
      values (pay.user_id, -unused, p_kind::public.token_tx_reason, lot.id, p_payment_id, case when p_kind = 'refund' then '返金（未使用分）' else 'チャージバック（未使用分）' end);
    end if;
  end if;

  if p_kind = 'chargeback' and used > 0 then
    update public.profiles set token_debt = token_debt + used where id = pay.user_id;
    insert into public.token_transactions (user_id, delta, reason, lot_id, ref_id, note)
    values (pay.user_id, -used, 'chargeback', pay.lot_id, p_payment_id, 'チャージバック（使用済み分はマイナス残高）');
  end if;

  update public.payments set status = (case when p_kind = 'refund' then 'refunded' else 'disputed' end)::public.payment_status where id = p_payment_id;
  return unused + (case when p_kind = 'chargeback' then used else 0 end);
end;
$$;

-- ===== ダウンロード（トークン消費）: 停止中のアカウントとマイナス残高を考慮する =====
create or replace function public.purchase_work_version(
  p_user_id uuid,
  p_work_id uuid,
  p_params_hash text,
  p_cost integer,
  p_purchase_id uuid,
  p_package_path text,
  p_work_name text,
  p_template_name text
)
returns table (purchase_id uuid, charged integer)
language plpgsql security definer set search_path = '' as $$
declare
  existing_id uuid;
  balance integer;
  debt integer;
  account_status text;
  rest integer := p_cost;
  lot record;
  take integer;
begin
  if p_cost < 0 then
    raise exception 'invalid_cost';
  end if;
  if not exists (select 1 from public.works where id = p_work_id and user_id = p_user_id and status = 'active') then
    raise exception 'work_not_found';
  end if;

  -- 同じユーザーの購入処理を直列化する（残高の二重消費を防ぐ）
  select status, token_debt into account_status, debt from public.profiles where id = p_user_id for update;
  if account_status = 'suspended' then
    raise exception 'account_suspended';
  end if;

  select id into existing_id from public.purchases where work_id = p_work_id and params_hash = p_params_hash;
  if existing_id is not null then
    return query select existing_id, 0;
    return;
  end if;

  perform public.expire_token_lots(p_user_id);
  select coalesce(sum(remaining), 0) - coalesce(debt, 0) into balance
  from public.token_lots
  where user_id = p_user_id and remaining > 0 and expires_at > now();
  if balance < p_cost then
    raise exception 'insufficient_tokens';
  end if;

  insert into public.purchases (id, work_id, user_id, params_hash, token_spent, package_path, work_name, template_name)
  values (p_purchase_id, p_work_id, p_user_id, p_params_hash, p_cost, p_package_path, p_work_name, p_template_name);

  for lot in
    select id, remaining from public.token_lots
    where user_id = p_user_id and remaining > 0 and expires_at > now()
    order by expires_at, created_at
  loop
    exit when rest = 0;
    take := least(lot.remaining, rest);
    update public.token_lots set remaining = remaining - take where id = lot.id;
    insert into public.token_transactions (user_id, delta, reason, lot_id, ref_id, note)
    values (p_user_id, -take, 'consume', lot.id, p_purchase_id, p_work_name);
    rest := rest - take;
  end loop;

  return query select p_purchase_id, p_cost;
end;
$$;

-- お金・トークンを動かす関数はサーバー（service_role）からのみ呼ぶ
revoke execute on function public.expire_token_lots(uuid) from public, anon, authenticated;
revoke execute on function public.complete_token_payment(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.revoke_token_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.purchase_work_version(uuid, uuid, text, integer, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.expire_token_lots(uuid) to service_role;
grant execute on function public.complete_token_payment(uuid, text, text, text) to service_role;
grant execute on function public.revoke_token_payment(uuid, text) to service_role;
grant execute on function public.purchase_work_version(uuid, uuid, text, integer, uuid, text, text, text) to service_role;
