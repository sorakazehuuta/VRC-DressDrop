-- 購入済みの版（要件定義書 6.5）
-- ダウンロード時に unitypackage を生成して保管し、作品を編集・削除しても購入した版は再ダウンロードできるようにする

alter table public.purchases alter column work_id drop not null;
alter table public.purchases drop constraint purchases_work_id_fkey;
alter table public.purchases add constraint purchases_work_id_fkey
  foreign key (work_id) references public.works (id) on delete set null;
alter table public.purchases add column work_name text not null default '';
alter table public.purchases add column template_name text not null default '';
alter table public.purchases add column package_path text;

-- 生成した unitypackage の保管場所（非公開）。パスは "<user_id>/<purchase_id>.unitypackage"
insert into storage.buckets (id, name, public, file_size_limit)
values ('packages', 'packages', false, 52428800)
on conflict (id) do nothing;

create policy packages_select_own on storage.objects for select to authenticated
  using (bucket_id = 'packages' and (storage.foldername(name))[1] = auth.uid()::text);

-- トークンを古い順に消費し、購入済みの版を登録する。
-- 同じ版がすでに購入済みならトークンを消費せず、その購入 ID を返す。残高不足なら insufficient_tokens を投げる。
-- サーバー（service_role）からのみ呼ぶ
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
  perform 1 from public.profiles where id = p_user_id for update;

  select id into existing_id from public.purchases where work_id = p_work_id and params_hash = p_params_hash;
  if existing_id is not null then
    return query select existing_id, 0;
    return;
  end if;

  select coalesce(sum(remaining), 0) into balance
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

revoke execute on function public.purchase_work_version(uuid, uuid, text, integer, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.purchase_work_version(uuid, uuid, text, integer, uuid, text, text, text) to service_role;
