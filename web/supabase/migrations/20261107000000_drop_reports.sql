-- 通報の機能を削除したので、表と状態の型を消す（ポリシーと索引は表と一緒に消える）
drop table public.reports;
drop type public.report_status;
