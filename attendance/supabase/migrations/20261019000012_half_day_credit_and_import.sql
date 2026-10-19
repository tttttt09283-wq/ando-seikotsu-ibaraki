-- 0012: 祝日の半日勤務は振休0.5日（確定ルール 2026-10-19）／有給残数のExcel取込
--
-- 振休の付与日数
--   - 祝日の実労働が half_day_max_minutes（既定4時間）以下なら 0.5日、それを超えれば 1日
--   - 候補生成・報告の時点の実労働で日数を決め、承認時はその日数を付与する
-- 有給残数の取込（本部のみ）
--   - 「スタッフID・付与日・付与日数・取得済み日数・有効期限」を1行1付与で取り込む
--   - 未登録の付与は「移行」として登録し、取得済み日数は付与日付の取得として台帳に記録する
--   - 登録済みの付与は、残日数が取込データと違えば差分を「調整」として追記する（台帳は書き換えない）
--   - 同じファイルを何度取り込んでも結果は同じ（最新のデータに合わせて取り込み直せる）

alter table public.holiday_credit_policies
  add column half_day_max_minutes integer not null default 240 check (half_day_max_minutes >= 0);
grant update (half_day_max_minutes) on public.holiday_credit_policies to authenticated;

alter table public.holiday_credit_requests
  add column credited_days numeric(3, 1) not null default 1 check (credited_days > 0);

-- 実労働からの付与日数：半日勤務（既定4時間以下）は 0.5日
create or replace function app.holiday_credit_days(p_policy public.holiday_credit_policies, p_worked_minutes integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_worked_minutes <= p_policy.half_day_max_minutes then least(0.5, p_policy.credited_days)
    else p_policy.credited_days
  end
$$;

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
  select * into policy from public.holiday_credit_policies where credit_type = 'company_holiday_work_leave';

  for a in
    select d.attendance_id, d.staff_id, d.work_date, d.row_version, d.worked_minutes, d.home_clinic_id
      from public.attendance_daily d
      join public.company_holidays h on h.holiday_date = d.work_date and h.credit_target
     where d.work_date between p_from and p_to
       and (p_clinic_id is null or d.home_clinic_id = p_clinic_id)
       and d.status in ('manager_confirmed', 'closed')
       and d.worked_minutes >= policy.min_worked_minutes
       and app.holiday_credit_eligible(d.staff_id, d.work_date)
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
  return n;
end;
$$;

create or replace function public.submit_holiday_credit(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.holiday_credit_requests;
  att public.attendance_daily;
  policy public.holiday_credit_policies;
begin
  select * into r from public.holiday_credit_requests where request_id = p_request_id for update;
  if r.request_id is null then
    raise exception '候補が見つかりません' using errcode = 'P0002';
  end if;
  if not (app.is_hq() or r.home_clinic_id = any (app.managed_clinic_ids())) then
    raise exception 'この候補を報告する権限がありません' using errcode = '42501';
  end if;
  if r.status <> 'candidate' then
    raise exception 'この候補は既に報告・処理済みです' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '当日使用できなかった理由を入力してください' using errcode = '22023';
  end if;
  select * into att from public.attendance_daily where attendance_id = r.source_attendance_id;
  select * into policy from public.holiday_credit_policies where credit_type = r.credit_type;
  update public.holiday_credit_requests
     set status = 'pending', report_reason = btrim(p_reason), submitted_by = auth.uid(), submitted_at = now(),
         source_row_version = att.row_version, source_worked_minutes = att.worked_minutes,
         credited_days = app.holiday_credit_days(policy, att.worked_minutes)
   where request_id = r.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('holiday_credit_requests', r.request_id, r.home_clinic_id, 'manager', 'request', auth.uid(), btrim(p_reason));
end;
$$;

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
    raise exception '振休の付与承認は本部のみ可能です' using errcode = '42501';
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

-- 不整合の検出：付与後の実労働で日数が変わる場合（例：1日付与後に半日勤務へ修正）も検出する
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
             when not exists (select 1 from public.company_holidays h where h.holiday_date = r.source_work_date and h.credit_target) then 'not_holiday'
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
            or not exists (select 1 from public.company_holidays h where h.holiday_date = r.source_work_date and h.credit_target)
            or not app.holiday_credit_eligible(r.staff_id, r.source_work_date));
end;
$$;

-- ===== 有給残数の取込 =====
/*
 * p_rows: [{"row": 2, "staff_code": "1001", "grant_date": "2025-10-01", "granted_days": 11, "taken_days": 3,
 *           "expiration_date": "2027-09-30" (任意)}]
 * 1件でもエラーがあれば全件取り消す（単一トランザクション）。
 */
create or replace function public.import_paid_leave(p_rows jsonb, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_staff uuid;
  v_grant public.leave_grants;
  v_id uuid;
  v_granted numeric;
  v_taken numeric;
  v_target numeric;
  v_diff numeric;
  v_date date;
  v_exp date;
  v_row integer;
  created integer := 0;
  adjusted integer := 0;
  unchanged integer := 0;
  note text := 'Excel取込：' || coalesce(nullif(btrim(p_source), ''), 'ファイル名なし');
begin
  if not app.is_hq() then
    raise exception '有給残数の取込は本部のみ可能です' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '取り込む行がありません' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_rows) loop
    v_row := (item ->> 'row')::integer;
    select staff_id into v_staff from public.staff_profiles where staff_code = btrim(item ->> 'staff_code');
    if v_staff is null then
      raise exception '%行目：スタッフID「%」が登録されていません', v_row, item ->> 'staff_code' using errcode = '22023';
    end if;
    v_date := (item ->> 'grant_date')::date;
    v_granted := (item ->> 'granted_days')::numeric;
    v_taken := coalesce((item ->> 'taken_days')::numeric, 0);
    v_exp := coalesce(nullif(item ->> 'expiration_date', '')::date, (v_date + interval '2 years')::date - 1);
    if v_granted <= 0 or v_granted > 40 or v_taken < 0 or v_taken > v_granted
       or (v_granted * 2) <> floor(v_granted * 2) or (v_taken * 2) <> floor(v_taken * 2) then
      raise exception '%行目：日数が正しくありません（0.5日単位、取得済みは付与日数以下）', v_row using errcode = '22023';
    end if;
    if v_exp <= v_date then
      raise exception '%行目：有効期限は付与日より後にしてください', v_row using errcode = '22023';
    end if;
    v_target := v_granted - v_taken;

    perform 1 from public.staff_profiles where staff_id = v_staff for update;
    select * into v_grant from public.leave_grants where staff_id = v_staff and grant_date = v_date order by created_at limit 1;

    if v_grant.leave_grant_id is null then
      insert into public.leave_grants (staff_id, grant_date, granted_days, expiration_date, grant_type, annual_5day_target, note, created_by)
      values (v_staff, v_date, v_granted, v_exp, 'migration', v_granted >= 10, note, auth.uid())
      returning leave_grant_id into v_id;
      insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
      values (v_staff, v_id, 'grant', v_granted, v_date, note, auth.uid());
      if v_taken > 0 then
        -- 取込前の取得分（取得日が不明なため付与日付で記録。年5日取得義務の集計に含める）
        insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
        values (v_staff, v_id, 'use', -v_taken, v_date, note || '（取込前の取得済み日数）', auth.uid());
      end if;
      created := created + 1;
    else
      v_diff := v_target - app.leave_grant_remaining(v_grant.leave_grant_id);
      if v_diff = 0 then
        unchanged := unchanged + 1;
      else
        insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
        values (v_staff, v_grant.leave_grant_id, 'adjust', v_diff, app.today_jst(), note || '（最新データとの差分を調整）', auth.uid());
        adjusted := adjusted + 1;
      end if;
    end if;
  end loop;

  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, after, reason, is_backdated)
  values (auth.uid(), 'user', 'import', 'leave_grants',
          jsonb_build_object('rows', jsonb_array_length(p_rows), 'created', created, 'adjusted', adjusted, 'unchanged', unchanged), note, true);
  return jsonb_build_object('created', created, 'adjusted', adjusted, 'unchanged', unchanged);
end;
$$;

revoke all on function app.holiday_credit_days(public.holiday_credit_policies, integer) from public;
grant execute on function app.holiday_credit_days(public.holiday_credit_policies, integer) to authenticated, service_role;
revoke all on function public.import_paid_leave(jsonb, text) from public, anon;
grant execute on function public.import_paid_leave(jsonb, text) to authenticated;
