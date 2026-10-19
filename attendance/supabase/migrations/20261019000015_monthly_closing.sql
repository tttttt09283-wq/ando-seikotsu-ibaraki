-- 0015: 月次締め（院長確認 → 本部締め、院別・全院一括、理由付き再開・再締め）と出力ログ
--
--   open ──院長確認──▶ manager_confirmed ──本部締め──▶ closed ──本部再開（理由必須）──▶ reopened ──再締め──▶ closed
--          ◀──確認取消──
--
--   - 締め済みの月の勤怠（attendance_daily）は DB トリガーで書き込みを拒否する（RPC を経由しない書き込みも含む）。
--     シフト・打刻修正・休暇は既存のチェックで拒否済み。打刻原本は失わないよう記録するが、勤怠には再開まで反映しない
--   - 締め・再開・再締めの履歴（monthly_closing_events）は追記のみ。締め時点の集計値を snapshot に保存する
--   - 締め期間は暦月（末日締め）。月が終わるまでは院長確認・締めはできない

-- ---------------------------------------------------------------------------
-- 締めの履歴（追記のみ）
-- ---------------------------------------------------------------------------
create table public.monthly_closing_events (
  id          bigint generated always as identity primary key,
  closing_id  uuid not null references public.monthly_closings (closing_id),
  clinic_id   uuid not null references public.clinics (clinic_id),
  year_month  date not null,
  action      text not null check (action in ('manager_confirm', 'manager_unconfirm', 'close', 'reopen', 'reclose')),
  reason      text,
  actor_id    uuid,
  batch_id    uuid,
  snapshot    jsonb,
  created_at  timestamptz not null default now(),
  constraint monthly_closing_events_reopen_reason check (action <> 'reopen' or length(btrim(coalesce(reason, ''))) > 0)
);
create index monthly_closing_events_closing_idx on public.monthly_closing_events (closing_id, created_at);

create trigger monthly_closing_events_forbid_mutation
  before update or delete on public.monthly_closing_events
  for each row execute function app.forbid_mutation();

revoke all on public.monthly_closing_events from anon, authenticated;
grant select on public.monthly_closing_events to authenticated;
alter table public.monthly_closing_events enable row level security;
create policy monthly_closing_events_select on public.monthly_closing_events
  for select to authenticated using (app.can_manage_clinic(clinic_id));

-- ---------------------------------------------------------------------------
-- 締め済み期間の勤怠は誰も変更できない
-- ---------------------------------------------------------------------------
create or replace function app.guard_attendance_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r public.attendance_daily := case when tg_op = 'DELETE' then old else new end;
begin
  if (r.home_clinic_id is not null and app.is_month_closed(r.home_clinic_id, r.work_date))
     or (tg_op = 'UPDATE' and old.home_clinic_id is not null and app.is_month_closed(old.home_clinic_id, old.work_date)) then
    raise exception '%年%月は締め済みのため、勤怠を変更できません（本部による締めの再開が必要です）',
      extract(year from r.work_date), extract(month from r.work_date)
      using errcode = 'P0001';
  end if;
  return r;
end;
$$;

create trigger attendance_daily_guard_period
  before insert or update or delete on public.attendance_daily
  for each row execute function app.guard_attendance_period();

-- ---------------------------------------------------------------------------
-- 共通：月の行を用意する、月の未解決事項を数える
-- ---------------------------------------------------------------------------
create or replace function app.closing_row(p_clinic_id uuid, p_month date)
returns public.monthly_closings
language plpgsql
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', p_month)::date;
  r public.monthly_closings;
begin
  insert into public.monthly_closings (clinic_id, year_month) values (p_clinic_id, m)
  on conflict (clinic_id, year_month) do nothing;
  select * into r from public.monthly_closings where clinic_id = p_clinic_id and year_month = m for update;
  return r;
end;
$$;

-- 締めの前に確認する事項（院・月）
create or replace function public.closing_issues(p_clinic_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院です' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'missing_punch', (select count(*) from public.attendance_daily a
                       where a.home_clinic_id = p_clinic_id and a.work_date between m and m_end and a.has_missing_punch),
    'needs_recalc', (select count(*) from public.attendance_daily a
                      where a.home_clinic_id = p_clinic_id and a.work_date between m and m_end and a.needs_recalc),
    'unconfirmed', (select count(*) from public.attendance_daily a
                     where a.home_clinic_id = p_clinic_id and a.work_date between m and m_end and a.status = 'open'),
    'pending_adjustments', (select count(*) from public.attendance_adjustment_requests q
                             where q.status = 'manager_approved' and q.work_date between m and m_end
                               and coalesce(app.staff_primary_clinic_id(q.staff_id, q.work_date), q.clinic_id) = p_clinic_id),
    'pending_leave', (select count(*) from public.leave_requests l
                       where l.home_clinic_id = p_clinic_id and l.status in ('pending', 'manager_approved')
                         and l.start_date <= m_end and l.end_date >= m)
  );
end;
$$;

-- 締め時点の集計（スタッフ別）
create or replace function app.closing_snapshot(p_clinic_id uuid, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'staff_id', s.staff_id, 'days', s.days, 'worked', s.worked, 'overtime_non_statutory', s.ot1,
           'overtime_statutory', s.ot2, 'late_night', s.night, 'legal_holiday', s.legal) order by s.staff_id), '[]'::jsonb)
    from (
      select a.staff_id, count(*) filter (where a.worked_minutes > 0) as days, sum(a.worked_minutes) as worked,
             sum(a.overtime_non_statutory_minutes) as ot1, sum(a.overtime_statutory_minutes) as ot2,
             sum(a.late_night_minutes) as night, sum(a.legal_holiday_minutes) as legal
        from public.attendance_daily a
       where a.home_clinic_id = p_clinic_id
         and a.work_date between date_trunc('month', p_month)::date and (date_trunc('month', p_month) + interval '1 month - 1 day')::date
       group by a.staff_id
    ) s
$$;

-- ---------------------------------------------------------------------------
-- 院長確認（月）：問題のない日を確認済みにし、残った問題がある場合は理由を必須にする
-- ---------------------------------------------------------------------------
create or replace function public.manager_confirm_month(p_clinic_id uuid, p_month date, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', p_month)::date;
  c public.monthly_closings;
  confirmed jsonb;
  issues jsonb;
  remaining integer;
begin
  if not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院の勤怠は確認できません' using errcode = '42501';
  end if;
  if m >= date_trunc('month', app.today_jst())::date then
    raise exception '月が終わってから確認してください' using errcode = '22023';
  end if;
  c := app.closing_row(p_clinic_id, m);
  if c.status <> 'open' then
    raise exception 'この月は既に院長確認済み、または締め済みです' using errcode = '22023';
  end if;

  confirmed := public.confirm_attendance(p_clinic_id, m, (m + interval '1 month - 1 day')::date);
  issues := public.closing_issues(p_clinic_id, m);
  remaining := (issues ->> 'missing_punch')::int + (issues ->> 'needs_recalc')::int + (issues ->> 'unconfirmed')::int
             + (issues ->> 'pending_adjustments')::int;
  if remaining > 0 and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception '未解決の事項があります（打刻漏れ%件・再計算待ち%件・未確認%件・打刻修正の承認待ち%件）。解決するか、理由を入力して確認してください',
      issues ->> 'missing_punch', issues ->> 'needs_recalc', issues ->> 'unconfirmed', issues ->> 'pending_adjustments'
      using errcode = 'P0001';
  end if;

  update public.monthly_closings
     set status = 'manager_confirmed', manager_confirmed_by = auth.uid(), manager_confirmed_at = now()
   where closing_id = c.closing_id;
  insert into public.monthly_closing_events (closing_id, clinic_id, year_month, action, reason, actor_id, snapshot)
  values (c.closing_id, p_clinic_id, m, 'manager_confirm', nullif(btrim(coalesce(p_reason, '')), ''), auth.uid(),
          jsonb_build_object('issues', issues, 'confirmed_days', confirmed -> 'confirmed'));
  return jsonb_build_object('confirmed_days', confirmed -> 'confirmed', 'issues', issues);
end;
$$;

create or replace function public.manager_unconfirm_month(p_clinic_id uuid, p_month date, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', p_month)::date;
  c public.monthly_closings;
begin
  if not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院です' using errcode = '42501';
  end if;
  c := app.closing_row(p_clinic_id, m);
  if c.status <> 'manager_confirmed' then
    raise exception '院長確認済みの月だけ取り消せます' using errcode = '22023';
  end if;
  update public.monthly_closings
     set status = 'open', manager_confirmed_by = null, manager_confirmed_at = null
   where closing_id = c.closing_id;
  insert into public.monthly_closing_events (closing_id, clinic_id, year_month, action, reason, actor_id)
  values (c.closing_id, p_clinic_id, m, 'manager_unconfirm', nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- 本部の締め（院別）。院長確認済み（または再開中）の月だけ締められる
-- ---------------------------------------------------------------------------
create or replace function public.close_month(p_clinic_id uuid, p_month date, p_batch_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  c public.monthly_closings;
  issues jsonb;
  was_reopened boolean;
begin
  if not app.is_hq() then
    raise exception '月次締めは本部のみ可能です' using errcode = '42501';
  end if;
  if m >= date_trunc('month', app.today_jst())::date then
    raise exception '月が終わってから締めてください' using errcode = '22023';
  end if;
  c := app.closing_row(p_clinic_id, m);
  if c.status = 'closed' then
    raise exception '既に締め済みです' using errcode = '22023';
  end if;
  if c.status = 'open' then
    raise exception '院長確認が済んでいません' using errcode = 'P0001';
  end if;
  was_reopened := c.status = 'reopened';
  issues := public.closing_issues(p_clinic_id, m);
  if (issues ->> 'needs_recalc')::int > 0 then
    raise exception '再計算が必要な勤怠が%件あります（シフト変更後の再計算をしてください）', issues ->> 'needs_recalc' using errcode = 'P0001';
  end if;
  if (issues ->> 'pending_adjustments')::int > 0 then
    raise exception '打刻修正の承認待ちが%件あります', issues ->> 'pending_adjustments' using errcode = 'P0001';
  end if;
  if (issues ->> 'pending_leave')::int > 0 then
    raise exception '承認待ちの休暇申請が%件あります', issues ->> 'pending_leave' using errcode = 'P0001';
  end if;

  -- 締める前に勤怠の状態を「締め済み」にする（締めた後はトリガーで変更できなくなる）
  update public.attendance_daily
     set status = 'closed'
   where home_clinic_id = p_clinic_id and work_date between m and m_end;
  update public.monthly_closings
     set status = 'closed', closed_by = auth.uid(), closed_at = now()
   where closing_id = c.closing_id;
  insert into public.monthly_closing_events (closing_id, clinic_id, year_month, action, actor_id, batch_id, snapshot)
  values (c.closing_id, p_clinic_id, m, case when was_reopened then 'reclose' else 'close' end, auth.uid(), p_batch_id,
          jsonb_build_object('issues', issues, 'staff', app.closing_snapshot(p_clinic_id, m)));
end;
$$;

-- 全院一括の締め：院ごとに締め、締められなかった院は理由を返す（締められた院はそのまま）
create or replace function public.close_months_bulk(p_month date, p_clinic_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid := gen_random_uuid();
  cl record;
  closed integer := 0;
  failures jsonb := '[]'::jsonb;
begin
  if not app.is_hq() then
    raise exception '月次締めは本部のみ可能です' using errcode = '42501';
  end if;
  for cl in
    select c.clinic_id, c.name from public.clinics c
     where (p_clinic_ids is null and c.status <> 'closed') or c.clinic_id = any (p_clinic_ids)
     order by c.display_order
  loop
    begin
      perform public.close_month(cl.clinic_id, p_month, v_batch);
      closed := closed + 1;
    exception when others then
      failures := failures || jsonb_build_object('clinic_id', cl.clinic_id, 'name', cl.name, 'message', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('batch_id', v_batch, 'closed', closed, 'failed', failures);
end;
$$;

-- ---------------------------------------------------------------------------
-- 本部の再開（理由必須）。再開中は修正でき、修正後に再締めする
-- ---------------------------------------------------------------------------
create or replace function public.reopen_month(p_clinic_id uuid, p_month date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m date := date_trunc('month', p_month)::date;
  c public.monthly_closings;
begin
  if not app.is_hq() then
    raise exception '締めの再開は本部のみ可能です' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception '再開の理由を入力してください' using errcode = '22023';
  end if;
  c := app.closing_row(p_clinic_id, m);
  if c.status <> 'closed' then
    raise exception '締め済みの月だけ再開できます' using errcode = '22023';
  end if;
  -- 先に再開してから勤怠の状態を戻す（締め済みのままだとトリガーで変更できない）
  update public.monthly_closings
     set status = 'reopened', reopen_count = reopen_count + 1
   where closing_id = c.closing_id;
  update public.attendance_daily
     set status = 'manager_confirmed'
   where home_clinic_id = p_clinic_id and status = 'closed'
     and work_date between m and (m + interval '1 month - 1 day')::date;
  insert into public.monthly_closing_events (closing_id, clinic_id, year_month, action, reason, actor_id)
  values (c.closing_id, p_clinic_id, m, 'reopen', btrim(p_reason), auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- 帳票出力の記録（個人情報を含むため、誰がいつ何を出力したかを残す）
-- ---------------------------------------------------------------------------
create or replace function public.log_export(p_report text, p_params jsonb, p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (app.is_hq() or cardinality(app.managed_clinic_ids()) > 0) then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, after)
  values (auth.uid(), 'user', 'export', left(p_report, 60), coalesce(p_params, '{}'::jsonb) || jsonb_build_object('rows', p_rows));
end;
$$;

revoke all on function app.closing_row(uuid, date) from public;
revoke all on function app.closing_snapshot(uuid, date) from public;
do $$
declare f text;
begin
  foreach f in array array[
    'public.closing_issues(uuid, date)',
    'public.manager_confirm_month(uuid, date, text)',
    'public.manager_unconfirm_month(uuid, date, text)',
    'public.close_month(uuid, date, uuid)',
    'public.close_months_bulk(date, uuid[])',
    'public.reopen_month(uuid, date, text)',
    'public.log_export(text, jsonb, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
