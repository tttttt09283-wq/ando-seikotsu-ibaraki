-- 勤怠：早朝出勤の理由・休憩が取れなかった理由
-- 早朝＝平日9:15より前・土日祝8:15より前の出勤（基準の時刻は勤怠表の「ルール設定」で変えられる）
-- 休憩なし＝実働が基準の時間（初期値6時間）を超えるのに、休憩が基準（初期値45分）より短い日
alter table public.attendance_records add column if not exists early_reason text;
alter table public.attendance_records add column if not exists break_reason text;
comment on column public.attendance_records.early_reason is '早朝出勤（平日9:15より前・土日祝8:15より前など。基準は勤怠表の設定）の理由';
comment on column public.attendance_records.break_reason is '休憩が取れなかった（基準の時間より短い）ときの理由';
notify pgrst, 'reload schema';
