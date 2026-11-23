-- 鍼灸保険の印に「同意書渡し（handed）」「同意書受取（received）」を追加（適用済み）
alter table public.patient_marks drop constraint if exists patient_marks_acu_check;
alter table public.patient_marks add constraint patient_marks_acu_check check (acu = any (array['guided','handed','received','got','no']));
