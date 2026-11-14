-- 予約：柔整鍼灸併用の患者様の「柔整」と「鍼灸」の担当を分ける
-- staff_id・time・duration は柔整の部分の担当・来院の始まり・柔整の時間。鍼灸の部分は別のスタッフ（acu_staff_id）が acu_duration 分。
-- acu_order：after＝柔整→鍼灸、before＝鍼灸→柔整
alter table public.bookings add column if not exists acu_staff_id integer;
alter table public.bookings add column if not exists acu_order text;
alter table public.bookings add column if not exists acu_duration integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='bookings_acu_order_check') then
    alter table public.bookings add constraint bookings_acu_order_check check (acu_order is null or acu_order in ('after','before'));
  end if;
  if not exists (select 1 from pg_constraint where conname='bookings_acu_duration_check') then
    alter table public.bookings add constraint bookings_acu_duration_check check (acu_duration is null or acu_duration between 5 and 180);
  end if;
end $$;
comment on column public.bookings.acu_staff_id is '柔整鍼灸併用で鍼灸を別のスタッフが担当するときの鍼灸の担当（staff_id・time・duration は柔整の部分）';
comment on column public.bookings.acu_order is 'after＝柔整のあとに鍼灸、before＝鍼灸のあとに柔整（time は来院の始まり）';
comment on column public.bookings.acu_duration is '鍼灸の部分の時間（分）';
notify pgrst, 'reload schema';
