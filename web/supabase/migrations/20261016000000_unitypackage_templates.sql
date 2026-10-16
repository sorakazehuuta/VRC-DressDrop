-- テンプレートを unitypackage で登録する形式に変更する
-- package_model_path には unitypackage のパスが入り、package_prefab_path にその中の Prefab の Unity 上のパスを記録する。
-- 以前の形式（FBX）のテンプレートは package_prefab_path が null になり、新しくダウンロードできない
alter table public.templates add column package_prefab_path text;

-- 以前の形式の Tシャツは提供を終了する（作品・購入履歴が参照しているので行は残し、一覧から外す）
update public.templates set is_public = false where slug = 'tshirt';
