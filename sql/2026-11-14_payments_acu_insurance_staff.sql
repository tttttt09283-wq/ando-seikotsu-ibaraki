-- 会計：鍼灸保険の担当を、保険診療（柔整）の担当と別に保存する
-- insurance_staff_id＝保険診療（柔整）の担当（柔整の分が無い会計は鍼灸の担当と同じ）、acu_insurance_staff_id＝鍼灸保険の担当
alter table public.payments add column if not exists acu_insurance_staff_id integer;
comment on column public.payments.acu_insurance_staff_id is '鍼灸保険（acu_insurance_amount）の担当。insurance_staff_id は保険診療（柔整）の担当（柔整が無い会計は鍼灸の担当と同じ）';
notify pgrst, 'reload schema';
