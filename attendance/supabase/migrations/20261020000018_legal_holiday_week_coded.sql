-- 0018: 休日管理の区分がある週は、区分の無い勤務日も「法定休日の判定済み」として扱う
--   （区分は休みの日にだけ付けるため、勤務日に「法定休日が未登録」の注意が出続けないようにする）

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
  week_coded boolean;
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
    -- その週に休日管理の区分があれば、区分の無い日（勤務日）も「法定休日の判定済み」とみなす
    week_coded := day_code is not null or exists (
      select 1 from public.staff_day_records r
       where r.staff_id = p_staff_id and r.work_date between cur_week and cur_week + 6
         and r.code in ('legal_holiday', 'non_legal_holiday', 'half_non_legal')
    );
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
      'legal_holiday_configured', legal_wd is not null or week_coded
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
             legal_holiday_configured = legal_wd is not null or week_coded,
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

revoke execute on function app.recalc_attendance(uuid, date, date) from public, authenticated;
