-- 保険の窓口負担を「柔整（保険診療）」と「鍼灸」に分けて保存する（保険診療＋鍼灸併用を1回の会計でしたときも分けて集計できるように）
alter table public.payments add column if not exists ju_insurance_amount integer;
alter table public.payments add column if not exists acu_insurance_amount integer;
notify pgrst, 'reload schema';
