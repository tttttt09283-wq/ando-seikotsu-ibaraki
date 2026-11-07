-- 患者様ごとの印に「レセ」を追加（月ごと）。済みにした月（YYYY-MM）を入れる
alter table public.patient_marks add column if not exists rese_months text[] not null default '{}';
notify pgrst, 'reload schema';
