-- 月ごとの集計に退会数を加える（戻り値の列が変わるため作り直す）
drop function if exists public.admin_monthly_stats(integer);

create function public.admin_monthly_stats(p_months integer default 12)
returns table (month text, sales_jpy bigint, payments bigint, refunded_jpy bigint, downloads bigint, paid_downloads bigint, tokens_spent bigint, signups bigint, withdrawals bigint)
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
  ),
  wd as (
    select to_char(deleted_at at time zone 'Asia/Tokyo', 'YYYY-MM') as month from public.deleted_accounts
  )
  select m.month,
    coalesce((select sum(amount_jpy) from pay where pay.month = m.month and status = 'completed'), 0)::bigint,
    coalesce((select count(*) from pay where pay.month = m.month and status = 'completed'), 0)::bigint,
    coalesce((select sum(amount_jpy) from pay where pay.month = m.month and status in ('refunded', 'disputed')), 0)::bigint,
    coalesce((select count(*) from dl where dl.month = m.month), 0)::bigint,
    coalesce((select count(*) from dl where dl.month = m.month and token_spent > 0), 0)::bigint,
    coalesce((select sum(token_spent) from dl where dl.month = m.month), 0)::bigint,
    coalesce((select count(*) from su where su.month = m.month), 0)::bigint,
    coalesce((select count(*) from wd where wd.month = m.month), 0)::bigint
  from months m
  order by m.month desc;
$$;

revoke execute on function public.admin_monthly_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_monthly_stats(integer) to service_role;

-- PostgREST に新しい関数を知らせる
notify pgrst, 'reload schema';
