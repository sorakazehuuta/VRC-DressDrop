-- Phase 8: 通報、規約への同意の記録、管理画面（作品・アカウントの停止、集計、同じカードのアカウント）

-- ===== 通報 =====
-- 作品は本人にしか見えないため、VRChat などで見かけた人がログインせずに通報できるようにする。
-- 作品の特定には、パッケージの LICENSE.txt に書いた「取得 ID」（purchases.id）を使う（分からなければ空でよい）
alter table public.reports alter column work_id drop not null;
alter table public.reports drop constraint reports_work_id_fkey;
alter table public.reports add constraint reports_work_id_fkey foreign key (work_id) references public.works (id) on delete set null;
alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey foreign key (reporter_id) references auth.users (id) on delete set null;
alter table public.reports add column purchase_id uuid references public.purchases (id) on delete set null;
alter table public.reports add column purchase_ref text;           -- 入力された取得 ID（一致する購入がなくても残す）
alter table public.reports add column category text not null default 'other'
  check (category in ('copyright', 'portrait', 'inappropriate', 'redistribution', 'other'));
alter table public.reports add column location text check (char_length(location) <= 500);   -- 見かけた場所（ワールド名・URL など）
alter table public.reports add column contact_email text check (char_length(contact_email) <= 254);
alter table public.reports add column ip_hash text;                -- 連続投稿の制限に使う（IP アドレスそのものは保存しない）
alter table public.reports add column admin_note text;
alter table public.reports add column resolved_by uuid references auth.users (id) on delete set null;
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_ip_hash_idx on public.reports (ip_hash, created_at desc);
-- 通報はサーバー（service_role）から登録する。ログインユーザー向けの登録ポリシーは使わない
drop policy reports_insert on public.reports;

-- ===== 購入した版の停止（権利侵害などで再ダウンロードを止める） =====
alter table public.purchases add column suspended_at timestamptz;

-- ===== 規約への同意の記録 =====
alter table public.profiles add column terms_version text;
alter table public.profiles add column terms_agreed_at timestamptz;
alter table public.payments add column terms_version text;

-- 新規登録時のプロフィール作成とトークン付与。メールでの登録は、登録画面で同意した規約の版を受け取る
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  signup_tokens constant integer := 3;
  new_lot_id uuid;
  agreed text := nullif(new.raw_user_meta_data ->> 'terms_version', '');
begin
  insert into public.profiles (id, display_name, terms_version, terms_agreed_at)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      ''
    ), 50),
    agreed,
    case when agreed is null then null else now() end
  );

  insert into public.token_lots (user_id, amount, remaining, source)
  values (new.id, signup_tokens, signup_tokens, 'signup_grant')
  returning id into new_lot_id;

  insert into public.token_transactions (user_id, delta, reason, lot_id, note)
  values (new.id, signup_tokens, 'signup_grant', new_lot_id, '新規登録特典');

  return new;
end;
$$;

-- ===== 管理者の操作の記録 =====
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,        -- suspend_user / restore_user / suspend_work / restore_work / suspend_purchase / restore_purchase / update_template / update_gimmick / resolve_report
  target_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index admin_actions_target_idx on public.admin_actions (target_id, created_at desc);
alter table public.admin_actions enable row level security;
create policy admin_actions_admin_select on public.admin_actions for select to authenticated using (public.is_admin());

-- ===== 管理画面の集計 =====
-- 月ごとの売上（入金済みの支払い。返金・チャージバックは別に数える）とダウンロード数（購入した版）
create or replace function public.admin_monthly_stats(p_months integer default 12)
returns table (month text, sales_jpy bigint, payments bigint, refunded_jpy bigint, downloads bigint, paid_downloads bigint, tokens_spent bigint, signups bigint)
language sql stable security definer set search_path = '' as $$
  with months as (
    select to_char(date_trunc('month', (now() at time zone 'Asia/Tokyo')) - make_interval(months => g), 'YYYY-MM') as month
    from generate_series(0, greatest(p_months, 1) - 1) as g
  ),
  pay as (
    select to_char(coalesce(completed_at, created_at) at time zone 'Asia/Tokyo', 'YYYY-MM') as month, status, amount_jpy
    from public.payments
    where status in ('completed', 'refunded', 'disputed')
  ),
  dl as (
    select to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM') as month, token_spent from public.purchases
  ),
  su as (
    select to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM') as month from public.profiles
  )
  select m.month,
    coalesce((select sum(amount_jpy) from pay where pay.month = m.month and status = 'completed'), 0)::bigint,
    coalesce((select count(*) from pay where pay.month = m.month and status = 'completed'), 0)::bigint,
    coalesce((select sum(amount_jpy) from pay where pay.month = m.month and status in ('refunded', 'disputed')), 0)::bigint,
    coalesce((select count(*) from dl where dl.month = m.month), 0)::bigint,
    coalesce((select count(*) from dl where dl.month = m.month and token_spent > 0), 0)::bigint,
    coalesce((select sum(token_spent) from dl where dl.month = m.month), 0)::bigint,
    coalesce((select count(*) from su where su.month = m.month), 0)::bigint
  from months m
  order by m.month desc;
$$;

-- 同じカード（Stripe の fingerprint）を複数のアカウントで使っているもの（要件定義書 6.11）
create or replace function public.admin_shared_cards()
returns table (card_fingerprint text, user_ids uuid[], payments bigint, blocked boolean, last_used_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.card_fingerprint,
    array_agg(distinct p.user_id),
    count(*),
    exists (select 1 from public.blocked_cards b where b.card_fingerprint = p.card_fingerprint),
    max(p.created_at)
  from public.payments p
  where p.card_fingerprint is not null
  group by p.card_fingerprint
  having count(distinct p.user_id) > 1
  order by max(p.created_at) desc
  limit 100;
$$;

revoke execute on function public.admin_monthly_stats(integer) from public, anon, authenticated;
revoke execute on function public.admin_shared_cards() from public, anon, authenticated;
grant execute on function public.admin_monthly_stats(integer) to service_role;
grant execute on function public.admin_shared_cards() to service_role;
