-- 購入した版の控え（ダウンロード履歴で編集内容とサムネイルを確認するため）
-- snapshot: { templateSlug, templateName, slots, params, images: { [imageId]: "<packages バケット内のパス>" } }
alter table public.purchases add column snapshot jsonb;
-- packages バケット内のサムネイル（"<user_id>/<purchase_id>/thumbnail.jpg"）
alter table public.purchases add column thumbnail_path text;
