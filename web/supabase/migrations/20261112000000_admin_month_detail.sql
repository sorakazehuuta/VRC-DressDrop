-- 管理画面の「月ごとの集計」の詳細ページ用（service_role だけが呼べる）

-- 一覧に出すユーザーのメールアドレス（auth.users は API から直接読めないため）
create or replace function public.admin_user_emails(p_ids uuid[])
returns table (id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text from auth.users u where u.id = any(p_ids);
$$;

-- その月（日本時間）のダウンロードを、テンプレートごとにまとめる
create or replace function public.admin_month_downloads_by_template(p_month text)
returns table (template_name text, downloads bigint, paid_downloads bigint, tokens_spent bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.template_name, ''), '（不明）'),
    count(*), count(*) filter (where p.token_spent > 0), coalesce(sum(p.token_spent), 0)
  from public.purchases p
  where to_char(p.created_at at time zone 'Asia/Tokyo', 'YYYY-MM') = p_month
  group by 1
  order by 2 desc, 1;
$$;

-- その月（日本時間の入金月）の支払いを、トークンのパックごとにまとめる（admin_monthly_stats と同じ数え方）
create or replace function public.admin_month_payments_by_pack(p_month text)
returns table (pack_name text, payments bigint, sales_jpy bigint, refunded_jpy bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(k.name, '（不明）'),
    count(*) filter (where p.status = 'completed'),
    coalesce(sum(p.amount_jpy) filter (where p.status = 'completed'), 0),
    coalesce(sum(p.amount_jpy) filter (where p.status in ('refunded', 'disputed')), 0)
  from public.payments p
  left join public.token_packs k on k.id = p.pack_id
  where p.status in ('completed', 'refunded', 'disputed')
    and to_char(coalesce(p.completed_at, p.created_at) at time zone 'Asia/Tokyo', 'YYYY-MM') = p_month
  group by 1
  order by 3 desc, 1;
$$;

revoke execute on function public.admin_user_emails(uuid[]) from public, anon, authenticated;
revoke execute on function public.admin_month_downloads_by_template(text) from public, anon, authenticated;
revoke execute on function public.admin_month_payments_by_pack(text) from public, anon, authenticated;
grant execute on function public.admin_user_emails(uuid[]) to service_role;
grant execute on function public.admin_month_downloads_by_template(text) to service_role;
grant execute on function public.admin_month_payments_by_pack(text) to service_role;

-- PostgREST に新しい関数を知らせる
notify pgrst, 'reload schema';
