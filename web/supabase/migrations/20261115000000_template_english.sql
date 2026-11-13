-- テンプレートの英語版の名前と説明（template.json の en。templates:sync が毎回書き込む）
-- 空のときは画面に日本語の名前・説明を出す
alter table public.templates add column if not exists name_en text not null default '';
alter table public.templates add column if not exists description_en text not null default '';

notify pgrst, 'reload schema';
