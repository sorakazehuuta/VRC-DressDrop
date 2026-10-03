-- 新規登録時のプロフィール作成とトークン付与（要件定義書 6.6 / 6.7）

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  signup_tokens constant integer := 3;
  new_lot_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      ''
    ), 50)
  );

  insert into public.token_lots (user_id, amount, remaining, source)
  values (new.id, signup_tokens, signup_tokens, 'signup_grant')
  returning id into new_lot_id;

  insert into public.token_transactions (user_id, delta, reason, lot_id, note)
  values (new.id, signup_tokens, 'signup_grant', new_lot_id, '新規登録特典');

  return new;
end;
$$;

-- 管理者が退会しても、その管理者が行ったトークン調整の履歴は残す
alter table public.token_transactions drop constraint token_transactions_created_by_fkey;
alter table public.token_transactions add constraint token_transactions_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
