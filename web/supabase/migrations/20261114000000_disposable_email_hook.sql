-- 使い捨てメールアドレスのドメインでは登録できないようにする（要件 6.6）
-- Supabase Auth の Before User Created フックで判定するので、メール・Google・Discord のどの登録方法にも効き、
-- Supabase の API を直接呼ばれても回避できない
-- 実行後、ダッシュボードの Authentication > Hooks で「Before User Created」に public.hook_before_user_created（Postgres）を設定する

-- source: list は同期コマンド（npm run email-domains:sync）が公開の一覧から登録したもの。manual は運営が手で足したもの（同期で消さない）
create table if not exists public.disposable_email_domains (
  domain text primary key check (domain = lower(domain) and domain <> ''),
  source text not null default 'manual' check (source in ('list', 'manual')),
  created_at timestamptz not null default now()
);

alter table public.disposable_email_domains enable row level security;

-- フックは supabase_auth_admin の権限で実行される
grant usage on schema public to supabase_auth_admin;
grant select on table public.disposable_email_domains to supabase_auth_admin;
drop policy if exists "auth admin can read disposable domains" on public.disposable_email_domains;
create policy "auth admin can read disposable domains" on public.disposable_email_domains
  as permissive for select to supabase_auth_admin using (true);

-- メールアドレスのドメインか、その親ドメイン（a.mailinator.com なら mailinator.com）が一覧にあれば拒否する
-- 拒否の文言には目印 disposable_email_domain を入れる（画面側の src/lib/auth.ts がこれを見て日本語の案内に変える）
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_domain text := lower(regexp_replace(coalesce(event->'user'->>'email', ''), '^.*@', ''));
  v_parts text[];
begin
  if v_domain = '' or position('.' in v_domain) = 0 then
    return '{}'::jsonb;
  end if;
  v_parts := string_to_array(v_domain, '.');
  if exists (
    select 1 from public.disposable_email_domains d
    where d.domain in (select array_to_string(v_parts[i:], '.') from generate_series(1, array_length(v_parts, 1)) as i)
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Signups from disposable email addresses are not allowed (disposable_email_domain)'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
