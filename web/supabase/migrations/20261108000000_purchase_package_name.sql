-- フォルダ・Prefab・ダウンロードのファイルで共通の名前（VRPrintLab_<テンプレート>_<購入日時>）。
-- 控えを削除した版を作り直しても同じ名前と GUID になるよう、購入ごとに記録する
alter table public.purchases add column package_name text;
