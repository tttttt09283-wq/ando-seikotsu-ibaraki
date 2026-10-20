-- 0016: 休日管理（本部のみ）
--
--   - staff_day_records：スタッフ・日ごとの区分（法定内＝法定休日／法定外休日／休出／振休／代休／計画年休／特休／欠勤／休業 など）。
--     本部だけが参照・登録できる。登録・変更・削除はすべて監査ログに残る
--   - 法定休日はスタッフ・日ごとの区分を優先して勤怠を計算する（無い日は従来どおり勤務条件・院の曜日）
--   - 代休：休日出勤（法定休日・法定外休日の勤務）から付与。期限は原則1か月（本部が個別に変更可）。振休と同じ残数で管理
--   - 有休の付与方式：入社日基準／基準日方式（例：毎年12月1日）をスタッフごとに切り替える
--   - 1人1ファイルの勤怠管理表（Excel）の取込：区分・基準日・振休/代休の残りを移行

-- ---------------------------------------------------------------------------
-- 区分
-- ---------------------------------------------------------------------------
create table public.staff_day_records (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff_profiles (staff_id),
  work_date   date not null,
  code        text not null check (code in (
                'legal_holiday', 'non_legal_holiday', 'half_non_legal',
                'holiday_work', 'half_work', 'pay_conversion',
                'paid', 'paid_half', 'planned_paid',
                'furikyu', 'furikyu_half', 'daikyu', 'daikyu_half',
                'special_paid', 'special_unpaid', 'absence', 'suspension', 'other_leave', 'other',
                'late', 'early'
              )),
  note        text,
  source      text not null default 'manual' check (source in ('manual', 'import')),
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint staff_day_records_unique unique (staff_id, work_date)
);

create trigger staff_day_records_touch before update on public.staff_day_records
  for each row execute function app.touch_updated_at();
create trigger staff_day_records_audit after insert or update or delete on public.staff_day_records
  for each row execute function app.audit_row_change('id');

revoke all on public.staff_day_records from anon, authenticated;
grant select on public.staff_day_records to authenticated;
alter table public.staff_day_records enable row level security;
create policy staff_day_records_select on public.staff_day_records for select to authenticated using (app.is_hq());

-- ---------------------------------------------------------------------------
-- 有休の付与方式（スタッフごと）
-- ---------------------------------------------------------------------------
create table public.staff_leave_settings (
  staff_id         uuid primary key references public.staff_profiles (staff_id),
  grant_basis      text not null default 'hire_date' check (grant_basis in ('hire_date', 'base_date')),
  first_base_date  date,                        -- 基準日方式の最初の付与日（以後毎年同じ月日）
  carryover_max    numeric(4, 1) not null default 20 check (carryover_max >= 0),
  note             text,
  updated_by       uuid,
  updated_at       timestamptz not null default now(),
  constraint staff_leave_settings_base check (grant_basis = 'hire_date' or first_base_date is not null)
);
create trigger staff_leave_settings_touch before update on public.staff_leave_settings
  for each row execute function app.touch_updated_at();
create trigger staff_leave_settings_audit after insert or update on public.staff_leave_settings
  for each row execute function app.audit_row_change('staff_id');

revoke all on public.staff_leave_settings from anon, authenticated;
grant select on public.staff_leave_settings to authenticated;
alter table public.staff_leave_settings enable row level security;
create policy staff_leave_settings_select on public.staff_leave_settings for select to authenticated using (app.is_hq());

-- ---------------------------------------------------------------------------
-- 代休（期限：原則1か月）と、取込時の残りの移行
-- ---------------------------------------------------------------------------
alter table public.holiday_credit_policies drop constraint holiday_credit_policies_credit_type_check;
alter table public.holiday_credit_policies add constraint holiday_credit_policies_credit_type_check
  check (credit_type in ('substitute_holiday', 'compensatory_day_off', 'company_holiday_work_leave', 'migration'));
alter table public.holiday_credit_policies drop constraint holiday_credit_policies_expiration_rule_check;
alter table public.holiday_credit_policies add constraint holiday_credit_policies_expiration_rule_check
  check (expiration_rule in ('end_of_month', 'one_month', 'days', 'none'));

update public.holiday_credit_policies
   set name = '代休（休日出勤）', expiration_rule = 'one_month', is_active = true,
       wage_note = '休日出勤の後に休ませる制度。休日出勤の割増賃金は代休を取っても必要（勤怠計算どおり支払う）'
 where credit_type = 'compensatory_day_off';
insert into public.holiday_credit_policies (credit_type, name, credited_days, min_worked_minutes, expiration_rule, is_active, wage_note)
values ('migration', '移行（取込時の振休・代休の残り）', 1, 1, 'none', false, '以前の管理表から取り込んだ残り。期限は取込時に本部が指定')
on conflict (credit_type) do nothing;

alter table public.holiday_credit_ledger drop constraint holiday_credit_entry_shape;
alter table public.holiday_credit_ledger add constraint holiday_credit_entry_shape check (
  (entry_type = 'grant' and credited_days > 0 and bucket_id is null
     and (source_attendance_id is not null or credit_type = 'migration'))
  or (entry_type = 'use' and credited_days < 0 and bucket_id is not null)
  or (entry_type = 'use_reversal' and credited_days > 0 and bucket_id is not null and reversal_of_id is not null)
  or (entry_type in ('expire', 'revoke') and credited_days < 0 and bucket_id is not null)
  or (entry_type = 'adjust' and bucket_id is not null)
);

-- ---------------------------------------------------------------------------
-- 勤怠計算：法定休日・法定外休日はスタッフ・日ごとの区分を優先
-- ---------------------------------------------------------------------------
create or replace function app.recalc_attendance(p_staff_id uuid, p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_start date := p_from - extract(dow from p_from)::integer;
  week_end   date := p_to + (6 - extract(dow from p_to)::integer);
  today      date := app.today_jst();
  ev         record;
  segs       app.punch_segment[] := '{}';
  flags      text[] := '{}';              -- 'YYYY-MM-DD|code'
  cur_start  timestamptz;
  cur_clinic uuid;
  cur_breaks tstzmultirange;
  cur_delayed boolean;
  brk_start  timestamptz;
  d          date;
  cum_legal  integer;
  cur_week   date;
  -- 1日分
  home_clinic uuid;
  contract   public.employment_contracts;
  legal_wd   smallint;
  day_segs   app.punch_segment[];
  closed_segs_sec bigint;
  worked     integer;
  brk        integer;
  night      integer;
  sched      integer;
  shift_first timestamptz;
  shift_last  timestamptz;
  has_work_shift boolean;
  has_leave  boolean;
  is_holiday boolean;
  is_legal   boolean;
  v_day_type text;
  day_code   text;
  first_in   timestamptz;
  last_out   timestamptz;
  has_open   boolean;
  open_stale boolean;
  daily_ot   integer;
  base_legal integer;
  within     integer;
  non_stat   integer;
  weekly_ot  integer;
  weekly_limit integer;
  day_flags  text[];
  existing   public.attendance_daily;
  new_vals   jsonb;
  old_vals   jsonb;
  v_attendance_id uuid;
  night_mr   tstzmultirange;
  seg        app.punch_segment;
  worked_mr  tstzmultirange;
begin
  if p_to < p_from or p_to - p_from > 62 then
    raise exception '再計算の期間が正しくありません' using errcode = '22023';
  end if;

  -- 1. 打刻原本から勤務区間を組み立てる（前後の日跨ぎを拾うため1日広く読む）
  for ev in
    select * from app.effective_punches
     where staff_id = p_staff_id
       and punched_at >= ((week_start - 1) + time '00:00') at time zone 'Asia/Tokyo'
       and punched_at < ((week_end + 2) + time '00:00') at time zone 'Asia/Tokyo'
     order by punched_at, created_at
  loop
    if ev.punch_type = 'clock_in' then
      if cur_start is not null then
        segs := segs || row(app.jst_date(cur_start), cur_clinic, cur_start, null, cur_breaks, cur_delayed)::app.punch_segment;
        flags := flags || (app.jst_date(cur_start)::text || '|missing_clock_out');
      end if;
      cur_start := ev.punched_at;
      cur_clinic := ev.clinic_id;
      cur_breaks := '{}';
      cur_delayed := ev.is_delayed_submission;
      brk_start := null;
    elsif ev.punch_type = 'break_start' then
      if cur_start is null then
        flags := flags || (app.jst_date(ev.punched_at)::text || '|orphan_break');
      elsif brk_start is null then
        brk_start := ev.punched_at;
      end if;
    elsif ev.punch_type = 'break_end' then
      if cur_start is null or brk_start is null then
        flags := flags || (app.jst_date(ev.punched_at)::text || '|orphan_break');
      else
        cur_breaks := cur_breaks + tstzmultirange(tstzrange(brk_start, ev.punched_at));
        brk_start := null;
      end if;
    elsif ev.punch_type = 'clock_out' then
      if cur_start is null then
        flags := flags || (app.jst_date(ev.punched_at)::text || '|clock_out_without_in');
      else
        if brk_start is not null then
          cur_breaks := cur_breaks + tstzmultirange(tstzrange(brk_start, ev.punched_at));
          flags := flags || (app.jst_date(cur_start)::text || '|missing_break_end');
          brk_start := null;
        end if;
        segs := segs || row(app.jst_date(cur_start), cur_clinic, cur_start, ev.punched_at, cur_breaks,
                            cur_delayed or ev.is_delayed_submission)::app.punch_segment;
        cur_start := null;
      end if;
    end if;
    if cur_start is not null and ev.is_delayed_submission then
      cur_delayed := true;
    end if;
  end loop;
  if cur_start is not null then
    if brk_start is not null then
      cur_breaks := cur_breaks + tstzmultirange(tstzrange(brk_start, null));
    end if;
    segs := segs || row(app.jst_date(cur_start), cur_clinic, cur_start, null, cur_breaks, cur_delayed)::app.punch_segment;
  end if;

  -- 2. 日ごとに集計（週ごとに法定時間の累計を持つ）
  cur_week := null;
  for d in select generate_series(week_start, week_end, interval '1 day')::date loop
    if cur_week is distinct from d - extract(dow from d)::integer then
      cur_week := d - extract(dow from d)::integer;
      cum_legal := 0;
    end if;

    home_clinic := app.staff_primary_clinic_id(p_staff_id, d);
    select * into contract
      from public.employment_contracts c
     where c.staff_id = p_staff_id and app.in_period(c.valid_from, c.valid_to, d);
    weekly_limit := coalesce(contract.legal_weekly_limit_minutes, 2400);
    legal_wd := coalesce(contract.legal_holiday_weekday, (select c.legal_holiday_weekday from public.clinics c where c.clinic_id = home_clinic));

    select coalesce(array_agg(s order by s.clock_in), '{}') into day_segs from unnest(segs) s where s.work_date = d;

    -- 確定シフト
    select coalesce(sum(extract(epoch from (s.scheduled_end - s.scheduled_start)) / 60 - s.scheduled_break_minutes), 0)::integer,
           min(s.scheduled_start), max(s.scheduled_end), count(*) > 0
      into sched, shift_first, shift_last, has_work_shift
      from public.shifts s
     where s.staff_id = p_staff_id and s.work_date = d and s.shift_type = 'work' and s.status in ('confirmed', 'revised');
    select exists (
      select 1 from public.shifts s
       where s.staff_id = p_staff_id and s.work_date = d and s.shift_type <> 'work' and s.status in ('confirmed', 'revised')
    ) into has_leave;
    is_holiday := exists (select 1 from public.company_holidays h where h.holiday_date = d);
    -- 休日区分（本部がスタッフ・日ごとに登録）があればそれを優先し、無ければ勤務条件・院の曜日で判定
    select r.code into day_code from public.staff_day_records r where r.staff_id = p_staff_id and r.work_date = d;
    is_legal := case
      when day_code = 'legal_holiday' then true
      when day_code in ('non_legal_holiday', 'half_non_legal') then false
      else legal_wd is not null and extract(dow from d)::integer = legal_wd
    end;

    -- 実績
    worked := 0; brk := 0; night := 0; has_open := false; open_stale := false;
    first_in := null; last_out := null;
    night_mr := tstzmultirange(
      tstzrange(((d - 1) + time '22:00') at time zone 'Asia/Tokyo', (d + time '05:00') at time zone 'Asia/Tokyo'),
      tstzrange((d + time '22:00') at time zone 'Asia/Tokyo', ((d + 1) + time '05:00') at time zone 'Asia/Tokyo'),
      tstzrange(((d + 1) + time '22:00') at time zone 'Asia/Tokyo', ((d + 2) + time '05:00') at time zone 'Asia/Tokyo')
    );
    closed_segs_sec := 0;
    foreach seg in array day_segs loop
      first_in := least(first_in, seg.clock_in);
      if seg.clock_out is null then
        has_open := true;
        if seg.clock_in < now() - interval '16 hours' then
          open_stale := true;
        end if;
        continue;
      end if;
      last_out := greatest(last_out, seg.clock_out);
      worked_mr := tstzmultirange(tstzrange(seg.clock_in, seg.clock_out)) - seg.breaks;
      closed_segs_sec := closed_segs_sec + app.mr_seconds(worked_mr);
      brk := brk + (app.mr_seconds(seg.breaks * tstzmultirange(tstzrange(seg.clock_in, seg.clock_out))) / 60)::integer;
      night := night + (app.mr_seconds(worked_mr * night_mr) / 60)::integer;
    end loop;
    worked := (closed_segs_sec / 60)::integer;

    day_flags := array(select split_part(f, '|', 2) from unnest(flags) f where split_part(f, '|', 1) = d::text);
    if open_stale then
      day_flags := day_flags || 'missing_clock_out'::text;
    end if;
    if exists (select 1 from unnest(day_segs) s where s.delayed) then
      day_flags := day_flags || 'delayed_submission'::text;
    end if;
    if exists (select 1 from unnest(day_segs) s where not app.staff_assigned_to_clinic(p_staff_id, s.clinic_id, d)) then
      day_flags := day_flags || 'unassigned_clinic'::text;
    end if;
    if worked > 0 and not has_work_shift then
      day_flags := day_flags || 'unscheduled_work'::text;
    end if;
    if (worked > 480 and brk < 60) or (worked > 360 and brk < 45) then
      day_flags := day_flags || 'break_shortage'::text;
    end if;
    day_flags := array(select distinct x from unnest(day_flags) x order by 1);

    v_day_type := case
      when is_legal then 'legal_holiday'
      when not has_work_shift and day_code in ('non_legal_holiday', 'half_non_legal') then 'scheduled_holiday'
      when not has_work_shift and is_holiday then 'company_holiday'
      when not has_work_shift and (has_leave or worked > 0) then 'scheduled_holiday'
      else 'workday'
    end;

    daily_ot := case when is_legal then 0 else greatest(0, worked - 480) end;
    base_legal := case when is_legal then 0 else least(worked, 480) end;
    within := case when is_legal then 0 else least(worked, sched, 480) end;
    non_stat := base_legal - within;
    weekly_ot := greatest(0, cum_legal + base_legal - weekly_limit) - greatest(0, cum_legal - weekly_limit);
    cum_legal := cum_legal + base_legal;
    -- 週の法定時間超の分は、所定外（法定内）→ 所定内の順に法定時間外へ振り替える
    within := within - (weekly_ot - least(non_stat, weekly_ot));
    non_stat := non_stat - least(non_stat, weekly_ot);

    -- 締め済みの月は変更しない（週の累計計算には含める）
    continue when home_clinic is not null and app.is_month_closed(home_clinic, d);

    select * into existing from public.attendance_daily a where a.staff_id = p_staff_id and a.work_date = d for update;
    if existing.attendance_id is null and cardinality(day_segs) = 0 and not has_work_shift and cardinality(day_flags) = 0 then
      continue; -- 打刻もシフトもない日は行を作らない
    end if;

    new_vals := jsonb_build_object(
      'home_clinic_id', home_clinic,
      'clinic_ids', (select coalesce(jsonb_agg(distinct s.clinic_id order by s.clinic_id), '[]'::jsonb) from unnest(day_segs) s),
      'first_clock_in', first_in,
      'last_clock_out', case when has_open then null else last_out end,
      'break_minutes', brk,
      'worked_minutes', worked,
      'scheduled_minutes', sched,
      'within_scheduled_minutes', within,
      'overtime_non_statutory_minutes', non_stat,
      'overtime_statutory_minutes', daily_ot + weekly_ot,
      'weekly_overtime_minutes', weekly_ot,
      'late_night_minutes', night,
      'legal_holiday_minutes', case when is_legal then worked else 0 end,
      'scheduled_holiday_minutes', case when v_day_type in ('scheduled_holiday', 'company_holiday') then worked else 0 end,
      'late_minutes', case when has_work_shift and first_in > shift_first
                           then floor(extract(epoch from first_in - shift_first) / 60)::integer else 0 end,
      'early_leave_minutes', case when has_work_shift and not has_open and last_out is not null and last_out < shift_last
                                  then floor(extract(epoch from shift_last - last_out) / 60)::integer else 0 end,
      'is_absent', has_work_shift and d < today and cardinality(day_segs) = 0 and not has_leave,
      'has_missing_punch', open_stale or day_flags && array['missing_clock_out', 'missing_break_end', 'clock_out_without_in', 'orphan_break'],
      'anomalies', to_jsonb(day_flags),
      'day_type', v_day_type,
      'legal_holiday_configured', legal_wd is not null or day_code is not null
    );

    if existing.attendance_id is null then
      insert into public.attendance_daily (staff_id, work_date, calculated_at)
      values (p_staff_id, d, now())
      returning * into existing;
      old_vals := null;
    else
      old_vals := jsonb_build_object(
        'home_clinic_id', existing.home_clinic_id,
        'clinic_ids', to_jsonb(existing.clinic_ids),
        'first_clock_in', existing.first_clock_in,
        'last_clock_out', existing.last_clock_out,
        'break_minutes', existing.break_minutes,
        'worked_minutes', existing.worked_minutes,
        'scheduled_minutes', existing.scheduled_minutes,
        'within_scheduled_minutes', existing.within_scheduled_minutes,
        'overtime_non_statutory_minutes', existing.overtime_non_statutory_minutes,
        'overtime_statutory_minutes', existing.overtime_statutory_minutes,
        'weekly_overtime_minutes', existing.weekly_overtime_minutes,
        'late_night_minutes', existing.late_night_minutes,
        'legal_holiday_minutes', existing.legal_holiday_minutes,
        'scheduled_holiday_minutes', existing.scheduled_holiday_minutes,
        'late_minutes', existing.late_minutes,
        'early_leave_minutes', existing.early_leave_minutes,
        'is_absent', existing.is_absent,
        'has_missing_punch', existing.has_missing_punch,
        'anomalies', to_jsonb(array(select x from unnest(existing.anomalies) x where x <> 'changed_after_confirm' order by 1)),
        'day_type', existing.day_type,
        'legal_holiday_configured', existing.legal_holiday_configured
      );
    end if;
    v_attendance_id := existing.attendance_id;

    if old_vals is distinct from new_vals then
      update public.attendance_daily a
         set home_clinic_id = home_clinic,
             clinic_ids = array(select distinct s.clinic_id from unnest(day_segs) s order by 1),
             first_clock_in = first_in,
             last_clock_out = (new_vals ->> 'last_clock_out')::timestamptz,
             break_minutes = brk,
             worked_minutes = worked,
             scheduled_minutes = sched,
             within_scheduled_minutes = within,
             overtime_non_statutory_minutes = non_stat,
             overtime_statutory_minutes = daily_ot + weekly_ot,
             weekly_overtime_minutes = weekly_ot,
             late_night_minutes = night,
             legal_holiday_minutes = (new_vals ->> 'legal_holiday_minutes')::integer,
             scheduled_holiday_minutes = (new_vals ->> 'scheduled_holiday_minutes')::integer,
             late_minutes = (new_vals ->> 'late_minutes')::integer,
             early_leave_minutes = (new_vals ->> 'early_leave_minutes')::integer,
             is_absent = (new_vals ->> 'is_absent')::boolean,
             has_missing_punch = (new_vals ->> 'has_missing_punch')::boolean,
             -- 院長確認後に値が変わった場合は確認を取り消し、印を付ける
             anomalies = day_flags || case when existing.status = 'manager_confirmed' and old_vals is not null
                                           then array['changed_after_confirm'] else '{}'::text[] end,
             day_type = v_day_type,
             legal_holiday_configured = legal_wd is not null or day_code is not null,
             status = case when existing.status = 'manager_confirmed' and old_vals is not null then 'open' else existing.status end,
             confirmed_by = case when existing.status = 'manager_confirmed' and old_vals is not null then null else existing.confirmed_by end,
             confirmed_at = case when existing.status = 'manager_confirmed' and old_vals is not null then null else existing.confirmed_at end,
             row_version = existing.row_version + case when old_vals is null then 0 else 1 end,
             needs_recalc = false,
             calculated_at = now()
       where a.attendance_id = v_attendance_id;
    else
      update public.attendance_daily a set needs_recalc = false, calculated_at = now() where a.attendance_id = v_attendance_id;
    end if;

    delete from public.attendance_segments s where s.staff_id = p_staff_id and s.work_date = d;
    insert into public.attendance_segments (attendance_id, staff_id, work_date, clinic_id, clock_in, clock_out, breaks, break_minutes, has_delayed)
    select v_attendance_id, p_staff_id, d, s.clinic_id, s.clock_in, s.clock_out, s.breaks,
           (app.mr_seconds(s.breaks * tstzmultirange(tstzrange(s.clock_in, coalesce(s.clock_out, now())))) / 60)::integer,
           s.delayed
      from unnest(day_segs) s;
  end loop;
end;
$$;

-- 代休の期限：勤務日から1か月
create or replace function public.approve_holiday_credit(p_request_id uuid, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.holiday_credit_requests;
  policy public.holiday_credit_policies;
  att public.attendance_daily;
  v_exp date;
  v_id uuid;
begin
  if not app.is_hq() then
    raise exception '振休・代休の付与承認は本部のみ可能です' using errcode = '42501';
  end if;
  select * into r from public.holiday_credit_requests where request_id = p_request_id for update;
  if r.request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'この申請は承認待ちではありません（既に処理済みの可能性があります）' using errcode = '22023';
  end if;
  select * into policy from public.holiday_credit_policies where credit_type = r.credit_type;
  if not policy.is_active then
    raise exception '「%」は付与条件・期限が設定されていないため、正式付与できません', policy.name using errcode = '22023';
  end if;
  select * into att from public.attendance_daily where attendance_id = r.source_attendance_id;
  if att.worked_minutes < policy.min_worked_minutes or att.row_version <> r.source_row_version then
    raise exception '報告後に勤怠実績が変更されています。勤怠を確認してから再度報告してください' using errcode = '22023';
  end if;

  v_exp := case policy.expiration_rule
             when 'end_of_month' then (date_trunc('month', r.source_work_date) + interval '1 month - 1 day')::date
             when 'days' then r.source_work_date + policy.expiration_days
             when 'one_month' then (r.source_work_date + interval '1 month')::date
             else null end;

  insert into public.holiday_credit_ledger (staff_id, entry_type, request_id, source_work_date, source_attendance_id, credit_type,
                                            credited_days, approval_status, approved_by, approved_at, expiration_date, effective_date, created_by)
  values (r.staff_id, 'grant', r.request_id, r.source_work_date, r.source_attendance_id, r.credit_type,
          r.credited_days, 'approved', auth.uid(), now(), v_exp, r.source_work_date, auth.uid())
  returning holiday_credit_id into v_id;

  update public.holiday_credit_requests set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where request_id = r.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('holiday_credit_requests', r.request_id, r.home_clinic_id, 'hq', 'approve', auth.uid(), p_comment);
  return v_id;
end;
$$;
-- ---------------------------------------------------------------------------
-- 区分の登録（本部のみ）。p_rows: [{"date": "2026-10-04", "code": "legal_holiday" | null（削除）, "note": "..."}]
-- 締め済みの月は変更できない。変更した日は勤怠を再計算する
-- ---------------------------------------------------------------------------
create or replace function app.recalc_dates(p_staff_id uuid, p_dates date[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m date;
begin
  -- 月ごとにまとめて再計算（再計算は最大62日）
  for m in select distinct date_trunc('month', x)::date from unnest(p_dates) x order by 1 loop
    perform app.recalc_attendance(p_staff_id, m, (m + interval '1 month - 1 day')::date);
  end loop;
end;
$$;

create or replace function public.set_staff_day_records(p_staff_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_date date;
  v_code text;
  v_home uuid;
  changed date[] := '{}';
begin
  if not app.is_hq() then
    raise exception '休日管理は本部のみ可能です' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_profiles where staff_id = p_staff_id) then
    raise exception 'スタッフが見つかりません' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 400 then
    raise exception '一度に登録できるのは400日分までです' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_rows) loop
    v_date := (item ->> 'date')::date;
    v_code := nullif(item ->> 'code', '');
    v_home := app.staff_primary_clinic_id(p_staff_id, v_date);
    if v_home is not null and app.is_month_closed(v_home, v_date) then
      raise exception '%は締め済みの月のため変更できません（締めの再開が必要です）', v_date using errcode = 'P0001';
    end if;
    if v_code is null then
      delete from public.staff_day_records where staff_id = p_staff_id and work_date = v_date;
    else
      insert into public.staff_day_records (staff_id, work_date, code, note, source, updated_by)
      values (p_staff_id, v_date, v_code, nullif(btrim(coalesce(item ->> 'note', '')), ''), 'manual', auth.uid())
      on conflict (staff_id, work_date) do update
        set code = excluded.code, note = excluded.note, source = 'manual', updated_by = auth.uid()
      where public.staff_day_records.code is distinct from excluded.code
         or public.staff_day_records.note is distinct from excluded.note;
    end if;
    changed := changed || v_date;
  end loop;
  perform app.recalc_dates(p_staff_id, changed);
  return cardinality(changed);
end;
$$;

-- 有休の付与方式（本部のみ）。基準日方式の最初の付与日は、法定の最初の付与日（入社6か月後）以前にする
create or replace function public.set_staff_leave_settings(p_staff_id uuid, p_basis text, p_first_base_date date, p_carryover_max numeric default 20, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hire date;
begin
  if not app.is_hq() then
    raise exception '有休の付与方式の変更は本部のみ可能です' using errcode = '42501';
  end if;
  select hire_date into v_hire from public.staff_profiles where staff_id = p_staff_id;
  if v_hire is null then
    raise exception 'スタッフが見つかりません' using errcode = 'P0002';
  end if;
  if p_basis = 'base_date' then
    if p_first_base_date is null then
      raise exception '基準日（最初の付与日）を入力してください' using errcode = '22023';
    end if;
    if p_first_base_date > (v_hire + interval '6 months')::date then
      raise exception '最初の付与日は入社6か月後（%）以前にしてください（法定より遅い付与はできません）', (v_hire + interval '6 months')::date
        using errcode = '22023';
    end if;
  end if;
  insert into public.staff_leave_settings (staff_id, grant_basis, first_base_date, carryover_max, note, updated_by)
  values (p_staff_id, p_basis, case when p_basis = 'base_date' then p_first_base_date end, coalesce(p_carryover_max, 20), p_note, auth.uid())
  on conflict (staff_id) do update
    set grant_basis = excluded.grant_basis, first_base_date = excluded.first_base_date,
        carryover_max = excluded.carryover_max, note = excluded.note, updated_by = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 振休・代休の付与候補
--   振休：会社カレンダーの対象祝日の勤務
--   代休：休日出勤（法定休日・法定外休日の勤務）。対象祝日の勤務と「給与変換」の日は除く
-- ---------------------------------------------------------------------------
create or replace function public.generate_holiday_credit_candidates(p_clinic_id uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy public.holiday_credit_policies;
  a record;
  n integer := 0;
begin
  if p_clinic_id is null and not app.is_hq() then
    raise exception '全院の候補生成は本部のみ可能です' using errcode = '42501';
  end if;
  if p_clinic_id is not null and not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院の候補は生成できません' using errcode = '42501';
  end if;

  for policy in
    select * from public.holiday_credit_policies p
     where p.credit_type in ('company_holiday_work_leave', 'compensatory_day_off') and p.is_active
  loop
    for a in
      select d.attendance_id, d.staff_id, d.work_date, d.row_version, d.worked_minutes, d.home_clinic_id
        from public.attendance_daily d
       where d.work_date between p_from and p_to
         and (p_clinic_id is null or d.home_clinic_id = p_clinic_id)
         and d.status in ('manager_confirmed', 'closed')
         and d.worked_minutes >= policy.min_worked_minutes
         and app.holiday_credit_eligible(d.staff_id, d.work_date)
         and app.holiday_credit_source_ok(policy.credit_type, d.staff_id, d.work_date, d.day_type)
         and not exists (
           select 1 from public.holiday_credit_requests r
            where r.source_attendance_id = d.attendance_id and r.credit_type = policy.credit_type
              and r.status in ('candidate', 'pending', 'approved')
         )
    loop
      insert into public.holiday_credit_requests (staff_id, credit_type, source_work_date, source_attendance_id, source_row_version,
                                                  source_worked_minutes, home_clinic_id, credited_days)
      values (a.staff_id, policy.credit_type, a.work_date, a.attendance_id, a.row_version, a.worked_minutes, a.home_clinic_id,
              app.holiday_credit_days(policy, a.worked_minutes));
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

-- 付与の元になる勤務か（候補生成と不整合チェックで共通）
create or replace function app.holiday_credit_source_ok(p_credit_type text, p_staff_id uuid, p_date date, p_day_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_credit_type
    when 'company_holiday_work_leave' then
      exists (select 1 from public.company_holidays h where h.holiday_date = p_date and h.credit_target)
    when 'compensatory_day_off' then
      p_day_type in ('legal_holiday', 'scheduled_holiday')
      and not exists (select 1 from public.company_holidays h where h.holiday_date = p_date and h.credit_target)
      and not exists (select 1 from public.staff_day_records r
                       where r.staff_id = p_staff_id and r.work_date = p_date and r.code = 'pay_conversion')
    else false
  end
$$;

create or replace function public.holiday_credit_inconsistencies(p_clinic_id uuid default null)
returns table (request_id uuid, staff_id uuid, source_work_date date, issue text, granted_row_version integer, current_row_version integer,
               current_worked_minutes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_clinic_id is null and not app.is_hq() then
    raise exception '全院の確認は本部のみ可能です' using errcode = '42501';
  end if;
  if p_clinic_id is not null and not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院は確認できません' using errcode = '42501';
  end if;
  return query
    select r.request_id, r.staff_id, r.source_work_date,
           case
             when d.worked_minutes < p.min_worked_minutes then 'no_work'
             when not app.holiday_credit_source_ok(r.credit_type, r.staff_id, r.source_work_date, d.day_type) then 'not_holiday'
             when not app.holiday_credit_eligible(r.staff_id, r.source_work_date) then 'not_eligible'
             when app.holiday_credit_days(p, d.worked_minutes) <> r.credited_days then 'days_changed'
             else 'attendance_changed'
           end,
           r.source_row_version, d.row_version, d.worked_minutes
      from public.holiday_credit_requests r
      join public.attendance_daily d on d.attendance_id = r.source_attendance_id
      join public.holiday_credit_policies p on p.credit_type = r.credit_type
     where r.status = 'approved'
       and (p_clinic_id is null or r.home_clinic_id = p_clinic_id)
       and (d.row_version <> r.source_row_version
            or d.worked_minutes < p.min_worked_minutes
            or not app.holiday_credit_source_ok(r.credit_type, r.staff_id, r.source_work_date, d.day_type)
            or not app.holiday_credit_eligible(r.staff_id, r.source_work_date));
end;
$$;

-- ---------------------------------------------------------------------------
-- 1人1ファイルの勤怠管理表の取込（本部のみ・1人ずつ）
--   p_records: [{"date": "2025-01-04", "code": "furikyu"}]  … 手入力（manual）の日は上書きしない。同じファイルは何度取り込んでも同じ結果
--   p_first_base_date: 有休を基準日方式にする場合の最初の付与日（NULL なら変更しない）
--   p_credit_balance / p_balance_as_of / p_balance_expiration: 振休・代休の残りを「移行」として登録（NULL なら登録しない。同じ基準日の移行は1回だけ）
-- ---------------------------------------------------------------------------
create or replace function public.import_staff_holiday_file(
  p_staff_id uuid,
  p_records jsonb,
  p_first_base_date date,
  p_credit_balance numeric,
  p_balance_as_of date,
  p_balance_expiration date,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_date date;
  v_home uuid;
  imported integer := 0;
  kept_manual integer := 0;
  skipped_closed integer := 0;
  changed date[] := '{}';
  v_note text := '勤怠管理表の取込：' || coalesce(nullif(btrim(p_source), ''), 'ファイル名なし');
  v_balance_created boolean := false;
  r public.staff_day_records;
begin
  if not app.is_hq() then
    raise exception '休日管理の取込は本部のみ可能です' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_profiles where staff_id = p_staff_id) then
    raise exception 'スタッフが見つかりません' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 3000 then
    raise exception '取り込める日数を超えています' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_records) loop
    v_date := (item ->> 'date')::date;
    v_home := app.staff_primary_clinic_id(p_staff_id, v_date);
    if v_home is not null and app.is_month_closed(v_home, v_date) then
      skipped_closed := skipped_closed + 1;
      continue;
    end if;
    select * into r from public.staff_day_records where staff_id = p_staff_id and work_date = v_date;
    if r.id is not null and r.source = 'manual' then
      kept_manual := kept_manual + 1;
      continue;
    end if;
    if r.id is null or r.code is distinct from item ->> 'code' then
      insert into public.staff_day_records (staff_id, work_date, code, note, source, updated_by)
      values (p_staff_id, v_date, item ->> 'code', v_note, 'import', auth.uid())
      on conflict (staff_id, work_date) do update set code = excluded.code, note = excluded.note, updated_by = auth.uid();
      changed := changed || v_date;
    end if;
    imported := imported + 1;
  end loop;

  if p_first_base_date is not null then
    perform public.set_staff_leave_settings(p_staff_id, 'base_date', p_first_base_date, 20, v_note);
  end if;

  if p_credit_balance is not null and p_credit_balance > 0 then
    if p_balance_as_of is null or p_balance_expiration is null or p_balance_expiration < p_balance_as_of then
      raise exception '振休・代休の残りの基準日と期限を正しく入力してください' using errcode = '22023';
    end if;
    if (p_credit_balance * 2) <> floor(p_credit_balance * 2) or p_credit_balance > 60 then
      raise exception '振休・代休の残りは0.5日単位で入力してください' using errcode = '22023';
    end if;
    if not exists (select 1 from public.holiday_credit_ledger l
                    where l.staff_id = p_staff_id and l.credit_type = 'migration' and l.entry_type = 'grant'
                      and l.source_work_date = p_balance_as_of) then
      insert into public.holiday_credit_ledger (staff_id, entry_type, source_work_date, credit_type, credited_days, approval_status,
                                                approved_by, approved_at, expiration_date, effective_date, note, created_by)
      values (p_staff_id, 'grant', p_balance_as_of, 'migration', p_credit_balance, 'approved', auth.uid(), now(),
              p_balance_expiration, p_balance_as_of, v_note, auth.uid());
      v_balance_created := true;
    end if;
  end if;

  -- 勤怠のある日だけ再計算（区分で法定休日の判定が変わるため）
  perform app.recalc_dates(p_staff_id, array(
    select distinct x from unnest(changed) x
     where exists (select 1 from public.attendance_daily a where a.staff_id = p_staff_id and a.work_date = x)
  ));

  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id, after, reason)
  values (auth.uid(), 'user', 'import_holiday_file', 'staff_day_records', p_staff_id::text,
          jsonb_build_object('imported', imported, 'changed', cardinality(changed), 'kept_manual', kept_manual,
                             'skipped_closed', skipped_closed, 'first_base_date', p_first_base_date,
                             'credit_balance', case when v_balance_created then p_credit_balance end),
          v_note);
  return jsonb_build_object('imported', imported, 'changed', cardinality(changed), 'kept_manual', kept_manual,
                            'skipped_closed', skipped_closed, 'balance_created', v_balance_created);
end;
$$;

revoke all on function app.recalc_dates(uuid, date[]) from public;
revoke all on function app.holiday_credit_source_ok(text, uuid, date, text) from public;
do $$
declare f text;
begin
  foreach f in array array[
    'public.set_staff_day_records(uuid, jsonb)',
    'public.set_staff_leave_settings(uuid, text, date, numeric, text)',
    'public.generate_holiday_credit_candidates(uuid, date, date)',
    'public.holiday_credit_inconsistencies(uuid)',
    'public.approve_holiday_credit(uuid, text)',
    'public.import_staff_holiday_file(uuid, jsonb, date, numeric, date, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke execute on function app.recalc_attendance(uuid, date, date) from public, authenticated;
