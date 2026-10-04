-- ギミック（要件定義書 6.3）
-- 定義は web/gimmicks/catalog/*.json を正とし、npm run gimmicks:sync で登録する

alter table public.gimmicks add column category text not null default '';
-- 画面の設定項目・組み合わせのルール・Unity 側の組み立て手順など（schema は src/lib/gimmicks/schema.ts）
alter table public.gimmicks add column definition jsonb not null default '{}'::jsonb;
alter table public.gimmicks alter column script_path drop not null;

-- ギミックを足した版の課金のため、ギミックを除いた「土台の版」と、含めたギミックを記録する
alter table public.purchases add column base_hash text;
alter table public.purchases add column gimmick_slugs text[] not null default '{}';
create index purchases_work_base_idx on public.purchases (work_id, base_hash);
