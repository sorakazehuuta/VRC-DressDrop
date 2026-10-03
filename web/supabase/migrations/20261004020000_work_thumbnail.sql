-- マイ作品の一覧に表示するサムネイル（work-images バケット内のパス）
alter table public.works add column thumbnail_path text;
