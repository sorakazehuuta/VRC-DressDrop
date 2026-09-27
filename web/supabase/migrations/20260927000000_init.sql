-- VRC-DressDrop 初期スキーマ（要件定義書 10章）

create extension if not exists pgcrypto;

-- ===== 共通 =====
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===== enum =====
create type public.token_source as enum ('signup_grant', 'purchase', 'admin');
create type public.token_tx_reason as enum ('signup_grant', 'purchase', 'consume', 'expire', 'admin_adjust');
create type public.payment_status as enum ('created', 'completed', 'failed', 'refunded');
create type public.work_status as enum ('active', 'suspended');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ===== profiles =====
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 50),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ===== templates / gimmicks / token_packs =====
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  description text not null default '',
  thumbnail_path text,
  preview_model_path text not null,   -- ブラウザ表示用 glb
  package_model_path text not null,   -- unitypackage 同梱用 fbx
  -- 例: [{"key":"front","type":"print","material":"Mat_Print","label":"表面"},{"key":"base","type":"base","material":"Mat_Base","label":"生地"}]
  slots jsonb not null default '[]'::jsonb,
  token_cost integer not null check (token_cost > 0),
  is_public boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

create table public.gimmicks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  script_path text not null,
  params_schema jsonb not null default '{}'::jsonb,
  token_cost integer not null check (token_cost >= 0),
  is_public boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger gimmicks_updated_at before update on public.gimmicks
  for each row execute function public.set_updated_at();

create table public.token_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tokens integer not null check (tokens > 0),
  price_jpy integer not null check (price_jpy > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ===== works =====
create table public.works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.templates (id),
  name text not null default '無題の作品' check (char_length(name) between 1 and 100),
  -- スロットごとの編集パラメータ（scale/offset/rotation/color 等）
  params jsonb not null default '{}'::jsonb,
  -- [{"gimmick_id":"...","params":{...}}]
  gimmicks jsonb not null default '[]'::jsonb,
  status public.work_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index works_user_id_idx on public.works (user_id, updated_at desc);
create trigger works_updated_at before update on public.works
  for each row execute function public.set_updated_at();

create table public.work_images (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  slot text not null,
  storage_path text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  unique (work_id, slot)
);

-- ===== purchases（購入済みの版） =====
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  params_hash text not null,          -- テンプレート・パラメータ・画像のハッシュ（ギミックは含めない）
  gimmick_ids uuid[] not null default '{}',
  token_spent integer not null check (token_spent >= 0),
  created_at timestamptz not null default now(),
  unique (work_id, params_hash)
);
create index purchases_user_id_idx on public.purchases (user_id);

-- ===== payments =====
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_id uuid references public.token_packs (id),
  paypal_order_id text unique,
  amount_jpy integer not null check (amount_jpy > 0),
  tokens integer not null check (tokens > 0),
  status public.payment_status not null default 'created',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index payments_user_id_idx on public.payments (user_id, created_at desc);

-- ===== tokens =====
create table public.token_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0 and remaining <= amount),
  source public.token_source not null,
  payment_id uuid unique references public.payments (id),
  -- 資金決済法の適用外とするため、発行から180日（6か月未満）で失効させる
  expires_at timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now()
);
create index token_lots_user_active_idx on public.token_lots (user_id, expires_at) where remaining > 0;

create table public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason public.token_tx_reason not null,
  lot_id uuid references public.token_lots (id),
  ref_id uuid,                        -- purchases.id / payments.id など
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index token_transactions_user_idx on public.token_transactions (user_id, created_at desc);

create or replace function public.get_token_balance()
returns integer language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(remaining), 0)::integer
  from public.token_lots
  where user_id = auth.uid() and remaining > 0 and expires_at > now();
$$;

-- ===== reports（通報） =====
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.templates enable row level security;
alter table public.gimmicks enable row level security;
alter table public.token_packs enable row level security;
alter table public.works enable row level security;
alter table public.work_images enable row level security;
alter table public.purchases enable row level security;
alter table public.payments enable row level security;
alter table public.token_lots enable row level security;
alter table public.token_transactions enable row level security;
alter table public.reports enable row level security;

-- profiles: 本人のみ参照。更新は display_name のみ（is_admin は変更不可）
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;

-- カタログ: 公開分は誰でも参照可。書き込みは管理者のみ
create policy templates_select on public.templates for select to anon, authenticated
  using (is_public or public.is_admin());
create policy templates_admin_write on public.templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy gimmicks_select on public.gimmicks for select to anon, authenticated
  using (is_public or public.is_admin());
create policy gimmicks_admin_write on public.gimmicks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy token_packs_select on public.token_packs for select to anon, authenticated
  using (is_active or public.is_admin());
create policy token_packs_admin_write on public.token_packs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- works: 本人のみ CRUD（停止中の作品は更新不可）
create policy works_select_own on public.works for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy works_insert_own on public.works for insert to authenticated
  with check (user_id = auth.uid() and status = 'active');
create policy works_update_own on public.works for update to authenticated
  using (user_id = auth.uid() and status = 'active')
  with check (user_id = auth.uid() and status = 'active');
create policy works_delete_own on public.works for delete to authenticated
  using (user_id = auth.uid());
create policy works_admin_update on public.works for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy work_images_own on public.work_images for all to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.user_id = auth.uid() and w.status = 'active'));
create policy work_images_admin_select on public.work_images for select to authenticated
  using (public.is_admin());

-- お金・トークン関連: 本人は参照のみ。変更はサーバー（service role / security definer 関数）経由のみ
create policy purchases_select_own on public.purchases for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy payments_select_own on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy token_lots_select_own on public.token_lots for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy token_transactions_select_own on public.token_transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- reports: ログインユーザーは通報のみ可能。参照・対応は管理者
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_admin on public.reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===== Storage =====
-- work-images: 非公開。パスは "<user_id>/<work_id>/<slot>.<ext>"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-images', 'work-images', false, 10485760, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- template-assets: 公開（サムネイル・プレビュー用 glb）
insert into storage.buckets (id, name, public)
values ('template-assets', 'template-assets', true)
on conflict (id) do nothing;

create policy work_images_storage_own on storage.objects for all to authenticated
  using (bucket_id = 'work-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'work-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy template_assets_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'template-assets' and public.is_admin())
  with check (bucket_id = 'template-assets' and public.is_admin());
