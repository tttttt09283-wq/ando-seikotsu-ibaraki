-- 0017: 賃金管理（本部のみ）
--
--   - staff_wage_settings：スタッフごとの賃金（適用開始月つきの履歴）。月給・時給・日給、基礎賃金、手当、固定残業代、
--     時給を出す月の所定時間（人ごと）、残業の基準時間、交通費（月額／日額）
--   - payroll_inputs：月ごとの手入力（別バイト・MG代・年末調整・欠勤控除・雑手当の上書き・控除・備考）
--   - 計算（残業代・深夜・法定休日・60時間超）は締め済みの勤怠からサーバーで行う（src/lib/payroll）
--   - 参照・登録は本部のみ。院長・スタッフは見られない（RLS）。変更はすべて監査ログに残る

create table public.staff_wage_settings (
  id                         uuid primary key default gen_random_uuid(),
  staff_id                   uuid not null references public.staff_profiles (staff_id),
  valid_from                 date not null check (extract(day from valid_from) = 1),  -- 適用開始月（1日）
  pay_type                   text not null check (pay_type in ('monthly', 'hourly', 'daily')),
  basic_wage                 integer check (basic_wage is null or basic_wage >= 0),   -- 月給：基礎賃金（基本給＋資格・役職手当＋家族手当）
  qualification_allowance    integer not null default 0 check (qualification_allowance >= 0), -- 資格・役職手当（基礎賃金の内訳・参考）
  hourly_wage                integer check (hourly_wage is null or hourly_wage >= 0), -- 時給
  daily_wage                 integer check (daily_wage is null or daily_wage >= 0),   -- 日給
  monthly_hours              numeric(5, 1) check (monthly_hours is null or monthly_hours > 0), -- 時給を出す月の所定時間（例：151）
  overtime_threshold_hours   numeric(5, 1) check (overtime_threshold_hours is null or overtime_threshold_hours >= 0), -- 残業の基準時間（例：191）
  fixed_overtime_allowance   integer not null default 0 check (fixed_overtime_allowance >= 0), -- 固定残業代（月額）
  commute_type               text not null default 'none' check (commute_type in ('none', 'monthly', 'per_day')),
  commute_amount             integer not null default 0 check (commute_amount >= 0),
  misc_allowance             integer not null default 0 check (misc_allowance >= 0),  -- 雑手当（毎月の既定額）
  note                       text,
  created_by                 uuid,
  created_at                 timestamptz not null default now(),
  constraint staff_wage_settings_unique unique (staff_id, valid_from),
  constraint staff_wage_settings_shape check (
    (pay_type = 'monthly' and basic_wage is not null and monthly_hours is not null)
    or (pay_type = 'hourly' and hourly_wage is not null)
    or (pay_type = 'daily' and daily_wage is not null)
  )
);
create trigger staff_wage_settings_audit after insert or update or delete on public.staff_wage_settings
  for each row execute function app.audit_row_change('id');

create table public.payroll_inputs (
  staff_id             uuid not null references public.staff_profiles (staff_id),
  year_month           date not null check (extract(day from year_month) = 1),
  side_job_days        numeric(4, 1) not null default 0 check (side_job_days >= 0),  -- 別バイト／別MG業（日数）
  side_job_pay         integer not null default 0,                                   -- 別バイト／MG代
  year_end_adjustment  integer not null default 0,                                   -- 年末調整（＋還付／−徴収）
  absence_deduction    integer not null default 0 check (absence_deduction >= 0),    -- 欠勤控除（手入力）
  misc_allowance       integer check (misc_allowance is null or misc_allowance >= 0), -- 雑手当（この月だけ上書き）
  deduction            integer not null default 0,                                   -- 控除
  note                 text,
  updated_by           uuid,
  updated_at           timestamptz not null default now(),
  primary key (staff_id, year_month)
);
create trigger payroll_inputs_touch before update on public.payroll_inputs
  for each row execute function app.touch_updated_at();
create trigger payroll_inputs_audit after insert or update or delete on public.payroll_inputs
  for each row execute function app.audit_row_change('staff_id');

revoke all on public.staff_wage_settings, public.payroll_inputs from anon, authenticated;
grant select on public.staff_wage_settings, public.payroll_inputs to authenticated;
alter table public.staff_wage_settings enable row level security;
alter table public.payroll_inputs enable row level security;
create policy staff_wage_settings_select on public.staff_wage_settings for select to authenticated using (app.is_hq());
create policy payroll_inputs_select on public.payroll_inputs for select to authenticated using (app.is_hq());

-- ---------------------------------------------------------------------------
-- 賃金の登録（本部のみ）。同じ適用開始月は上書き、別の月は履歴として追加
-- ---------------------------------------------------------------------------
create or replace function public.save_wage_setting(p_staff_id uuid, p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_from date := date_trunc('month', (p_values ->> 'valid_from')::date)::date;
begin
  if not app.is_hq() then
    raise exception '賃金の登録は本部のみ可能です' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_profiles where staff_id = p_staff_id) then
    raise exception 'スタッフが見つかりません' using errcode = 'P0002';
  end if;
  if v_from is null then
    raise exception '適用開始月を入力してください' using errcode = '22023';
  end if;
  insert into public.staff_wage_settings (
    staff_id, valid_from, pay_type, basic_wage, qualification_allowance, hourly_wage, daily_wage, monthly_hours,
    overtime_threshold_hours, fixed_overtime_allowance, commute_type, commute_amount, misc_allowance, note, created_by
  ) values (
    p_staff_id, v_from, p_values ->> 'pay_type',
    (p_values ->> 'basic_wage')::integer, coalesce((p_values ->> 'qualification_allowance')::integer, 0),
    (p_values ->> 'hourly_wage')::integer, (p_values ->> 'daily_wage')::integer,
    (p_values ->> 'monthly_hours')::numeric, (p_values ->> 'overtime_threshold_hours')::numeric,
    coalesce((p_values ->> 'fixed_overtime_allowance')::integer, 0),
    coalesce(p_values ->> 'commute_type', 'none'), coalesce((p_values ->> 'commute_amount')::integer, 0),
    coalesce((p_values ->> 'misc_allowance')::integer, 0), nullif(btrim(coalesce(p_values ->> 'note', '')), ''), auth.uid()
  )
  on conflict (staff_id, valid_from) do update set
    pay_type = excluded.pay_type, basic_wage = excluded.basic_wage, qualification_allowance = excluded.qualification_allowance,
    hourly_wage = excluded.hourly_wage, daily_wage = excluded.daily_wage, monthly_hours = excluded.monthly_hours,
    overtime_threshold_hours = excluded.overtime_threshold_hours, fixed_overtime_allowance = excluded.fixed_overtime_allowance,
    commute_type = excluded.commute_type, commute_amount = excluded.commute_amount, misc_allowance = excluded.misc_allowance,
    note = excluded.note, created_by = auth.uid()
  returning id into v_id;
  return v_id;
end;
$$;

-- 月の手入力（本部のみ）
create or replace function public.save_payroll_input(p_staff_id uuid, p_month date, p_values jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception '賃金の入力は本部のみ可能です' using errcode = '42501';
  end if;
  insert into public.payroll_inputs (staff_id, year_month, side_job_days, side_job_pay, year_end_adjustment, absence_deduction,
                                     misc_allowance, deduction, note, updated_by)
  values (p_staff_id, date_trunc('month', p_month)::date,
          coalesce((p_values ->> 'side_job_days')::numeric, 0), coalesce((p_values ->> 'side_job_pay')::integer, 0),
          coalesce((p_values ->> 'year_end_adjustment')::integer, 0), coalesce((p_values ->> 'absence_deduction')::integer, 0),
          (p_values ->> 'misc_allowance')::integer, coalesce((p_values ->> 'deduction')::integer, 0),
          nullif(btrim(coalesce(p_values ->> 'note', '')), ''), auth.uid())
  on conflict (staff_id, year_month) do update set
    side_job_days = excluded.side_job_days, side_job_pay = excluded.side_job_pay, year_end_adjustment = excluded.year_end_adjustment,
    absence_deduction = excluded.absence_deduction, misc_allowance = excluded.misc_allowance, deduction = excluded.deduction,
    note = excluded.note, updated_by = auth.uid();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.save_wage_setting(uuid, jsonb)', 'public.save_payroll_input(uuid, date, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
