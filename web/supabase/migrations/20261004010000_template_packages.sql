-- unitypackage 同梱用の FBX は販売物なので、公開バケット（template-assets）とは分けて非公開で保管する
insert into storage.buckets (id, name, public)
values ('template-packages', 'template-packages', false)
on conflict (id) do nothing;

create policy template_packages_admin on storage.objects for all to authenticated
  using (bucket_id = 'template-packages' and public.is_admin())
  with check (bucket_id = 'template-packages' and public.is_admin());
