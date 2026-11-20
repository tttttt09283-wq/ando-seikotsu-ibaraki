-- 鍼灸保険対応者：患者様ごとの同意書の期限
alter table public.patient_marks add column if not exists acu_consent_until date;
notify pgrst, 'reload schema';
