-- AND GROUP MANAGEMENT SYSTEM — PHASE 9：ダッシュボードの集計と定期処理（通知）
-- 設計：docs/screens.md §4〜§7（KPI）、docs/architecture.md §5（定期処理）、docs/workflows.md §6.3・§7（通知）
-- ・KPI は院ごとに1行。見られる院だけ（GM・社長＝全院、BM＝担当エリア、院長＝自院）
-- ・定期処理は Vercel Cron から毎日 9:00 JST に1回（Hobby プランの上限内）。月曜は週次の判定（年5日）も行う
-- ・通知はイベントキーで一意にし、処理が2回動いても重複しない

-- 定期処理（サービスロール）からは全員の休暇を読めるようにする
create or replace function mgmt.can_view_leave_of(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
    or p_user = mgmt.current_user_id()
    or mgmt.can('leave.view.store')
    or exists (
      select 1 from mgmt.user_store_assignments a
      where a.user_id = p_user and mgmt.is_current(a.starts_on, a.ends_on) and mgmt.can('leave.view.store', a.store_id)
    )
$$;

-- ===== 院ごとの KPI =====
-- p_month：その月の1日（省略時は今月）。開催済み・取得済みなどは「その月の今日まで」で数える
-- 有給取得率は暫定の定義（Q-19）：その月に有効な付与（期間がその月にかかる付与）の日数のうち、取得済みの日数の割合
create or replace function mgmt.store_kpis(p_month date default null)
returns table (
  store_id uuid, store_name text, display_order int, staff_count int,
  meetings_held int, minutes_submitted int, minutes_on_time int, minutes_overdue_now int,
  decisions_due int, decisions_done int,
  parttime_total int, parttime_help int, parttime_exception int,
  president_pending int, shortage_requests int,
  paid_granted numeric, paid_taken numeric, five_day_risk int,
  shift_remaining numeric, shift_expired numeric, rule_unack int
)
language sql stable security definer set search_path = '' as $$
  with b as (
    select ms, (ms + interval '1 month')::date - 1 as me, least(mgmt.jst_today(), (ms + interval '1 month')::date - 1) as upto
    from (select date_trunc('month', coalesce(p_month, mgmt.jst_today()))::date as ms) x
  ),
  st as (
    select s.* from mgmt.stores s
    where s.id in (select mgmt.visible_store_ids())
      and (mgmt.can('dashboard.gm') or mgmt.can('dashboard.president') or mgmt.can('dashboard.area', s.id) or mgmt.can('dashboard.manager', s.id))
  ),
  -- 休暇・規定は主所属の院で数える（兼務で二重に数えない）
  mem as (
    select u.id as user_id, mgmt.primary_store_of(u.id) as store_id from mgmt.users u where u.status = 'active'
  ),
  lv as (
    select mem.store_id, t.code, g.*
    from mem join st on st.id = mem.store_id
    cross join b
    cross join mgmt.leave_types t
    cross join lateral mgmt.leave_grant_state(mem.user_id, t.id, b.upto) g
    where t.code in ('PAID','SHIFT','SHIFT_HOLIDAY') and mgmt.can('leave.view.store', st.id)
  ),
  fd as (
    select mem.store_id, mgmt.five_day_status(mem.user_id, b.upto) ->> 'level' as level
    from mem join st on st.id = mem.store_id cross join b
    where mgmt.can('leave.view.store', st.id)
  )
  select st.id, st.name, st.display_order,
    (select count(*)::int from mem where mem.store_id = st.id),
    (select count(*)::int from public.meetings m, b where m.mgmt_store_id = st.id and m.held_on between b.ms and b.upto and m.minutes_status <> 'exempt'),
    (select count(*)::int from public.meetings m, b where m.mgmt_store_id = st.id and m.held_on between b.ms and b.upto and m.minutes_status <> 'exempt' and m.minutes_submitted_at is not null),
    (select count(*)::int from public.meetings m, b where m.mgmt_store_id = st.id and m.held_on between b.ms and b.upto and m.minutes_status <> 'exempt' and m.minutes_submitted_at is not null and not m.minutes_submitted_late),
    (select count(*)::int from public.meetings m where m.mgmt_store_id = st.id and mgmt.meeting_status(m.held_on, m.minutes_submitted_at, m.minutes_status) = 'overdue'),
    (select count(*)::int from public.action_items a, b where a.mgmt_store_id = st.id and a.is_decision and a.due_date between b.ms and b.me),
    (select count(*)::int from public.action_items a, b where a.mgmt_store_id = st.id and a.is_decision and a.due_date between b.ms and b.me and a.status = 'done'),
    (select count(*)::int from mgmt.part_time_requests r, b where r.store_id = st.id and r.work_date between b.ms and b.me and r.status <> 'withdrawn'),
    (select count(*)::int from mgmt.part_time_requests r, b where r.store_id = st.id and r.work_date between b.ms and b.me and r.status <> 'withdrawn' and r.category = 'help'),
    (select count(*)::int from mgmt.part_time_requests r, b where r.store_id = st.id and r.work_date between b.ms and b.me and r.status <> 'withdrawn' and r.is_exception),
    (select count(*)::int from mgmt.approval_steps s
      left join mgmt.leave_requests lr on lr.id = s.leave_request_id
      left join mgmt.part_time_requests pr on pr.id = s.part_time_request_id
      left join mgmt.holiday_change_requests hr on hr.id = s.holiday_change_request_id
      where s.status = 'pending' and s.step_kind = 'president_final' and coalesce(lr.store_id, pr.store_id, hr.store_id) = st.id),
    (select count(*)::int from mgmt.leave_requests r, b where r.store_id = st.id and r.balance_shortage
      and (r.created_at at time zone 'Asia/Tokyo')::date between b.ms and b.me),
    (select coalesce(sum(lv.days + lv.adjusted), 0) from lv, b where lv.store_id = st.id and lv.code = 'PAID' and lv.grant_date <= b.upto and lv.expires_on >= b.ms),
    (select coalesce(sum(lv.taken), 0) from lv, b where lv.store_id = st.id and lv.code = 'PAID' and lv.grant_date <= b.upto and lv.expires_on >= b.ms),
    (select count(*)::int from fd where fd.store_id = st.id and fd.level in ('caution','warning','urgent')),
    (select coalesce(sum(lv.remaining), 0) from lv where lv.store_id = st.id and lv.code in ('SHIFT','SHIFT_HOLIDAY') and lv.state = 'active'),
    (select coalesce(sum(lv.remaining), 0) from lv where lv.store_id = st.id and lv.code in ('SHIFT','SHIFT_HOLIDAY') and lv.state = 'expired_alert' and lv.remaining > 0),
    (select count(*)::int from mem where mem.store_id = st.id and exists (
      select 1 from mgmt.company_rules r join mgmt.company_rule_versions v on v.id = r.current_version_id
      where mgmt.rule_applies_to(v.applies_to, mem.user_id)
        and not exists (select 1 from mgmt.rule_acknowledgements a where a.version_id = v.id and a.user_id = mem.user_id)))
  from st
  order by st.display_order
$$;

-- ===== 定期処理 =====
create table mgmt.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
alter table mgmt.job_runs enable row level security;
revoke all on mgmt.job_runs from anon, authenticated;
grant all on mgmt.job_runs to service_role;

-- 何人かにまとめて通知し、新しく届いた件数を返す（同じイベントキーは1回だけ）
create or replace function mgmt.notify_many(p_users uuid[], p_kind text, p_title text, p_body text, p_link text, p_event_key text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into mgmt.notifications (user_id, kind, title, body, link, event_key)
  select distinct x, p_kind, p_title, p_body, p_link, p_event_key
  from unnest(p_users) x join mgmt.users u on u.id = x and u.status = 'active'
  on conflict (user_id, event_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- 毎日の処理（Vercel Cron → /api/cron/daily → サービスロールで呼ぶ）。p_weekly：週次の判定もする（省略時は月曜だけ）
create or replace function mgmt.run_daily_jobs(p_weekly boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := mgmt.jst_today(); v_run bigint; r record; v_taken int; v_minutes jsonb;
  n_expiring int := 0; n_expired int := 0; n_task int := 0; n_five int := 0; v_weekly boolean;
begin
  insert into mgmt.job_runs (job) values ('daily') returning id into v_run;
  v_weekly := coalesce(p_weekly, extract(isodow from v_today) = 1);

  -- 1. 取得日を過ぎた「取得予定」を「取得済み」に
  v_taken := mgmt.confirm_leave_taken(v_today);
  -- 2. 議事録の期限の通知・状態の更新
  v_minutes := mgmt.run_minutes_reminders();

  -- 3. 有給の有効期限が近い（60日以内）：本人・院長
  for r in
    select u.id as user_id, u.name, g.grant_id, g.expires_on, g.remaining, mgmt.primary_store_of(u.id) as store_id
    from mgmt.users u cross join mgmt.leave_types t
    cross join lateral mgmt.leave_grant_state(u.id, t.id, v_today) g
    where u.status = 'active' and t.code = 'PAID' and g.state = 'active' and g.remaining > 0 and g.expires_on <= v_today + 60
  loop
    n_expiring := n_expiring + mgmt.notify_many(array[r.user_id] || array(select mgmt.store_managers(r.store_id)), 'leave_expiring',
      '有給の有効期限が近づいています：' || r.name || 'さん ' || r.remaining || '日',
      to_char(r.expires_on, 'YYYY-MM-DD') || 'まで有効。期限を過ぎると使えなくなります', '/staff/' || r.user_id || '/leave',
      'leave:' || r.grant_id || ':expiring');
  end loop;

  -- 4. 期限（発生した月の末日）を過ぎた振休：本人・院長・GM（残数は消さない）
  for r in
    select u.id as user_id, u.name, t.code, g.grant_id, g.expires_on, g.remaining, mgmt.primary_store_of(u.id) as store_id
    from mgmt.users u cross join mgmt.leave_types t
    cross join lateral mgmt.leave_grant_state(u.id, t.id, v_today) g
    where u.status = 'active' and t.code in ('SHIFT','SHIFT_HOLIDAY') and g.state = 'expired_alert' and g.remaining > 0
  loop
    n_expired := n_expired + mgmt.notify_many(array[r.user_id] || array(select mgmt.store_managers(r.store_id)) || array(select mgmt.users_with_global_role('GM')),
      'shift_expired', '期限を過ぎた振休があります：' || r.name || 'さん ' || r.remaining || '日（' || case r.code when 'SHIFT' then '振替' else '祝振替' end || '）',
      to_char(r.expires_on, 'YYYY-MM-DD') || 'が期限でした。取得日を決めて申請してください', '/staff/' || r.user_id || '/leave',
      'leave:' || r.grant_id || ':expired');
  end loop;

  -- 5. タスク（決定事項を含む）の期限：前日は担当者、超過は担当者・院長
  for r in
    select a.id, a.title, a.due_date, a.owner_user_id, a.mgmt_store_id, a.is_decision from public.action_items a
    where a.status <> 'done' and a.owner_user_id is not null and a.due_date is not null and a.due_date <= v_today + 1
  loop
    if r.due_date = v_today + 1 then
      n_task := n_task + mgmt.notify_many(array[r.owner_user_id], 'task_due', '【明日期限】' || case when r.is_decision then '会議の決定事項：' else 'タスク：' end || r.title,
        '期限 ' || to_char(r.due_date, 'YYYY-MM-DD'), '/tasks', 'task:' || r.id || ':due:d-1');
    elsif r.due_date < v_today then
      n_task := n_task + mgmt.notify_many(array[r.owner_user_id] || array(select mgmt.store_managers(r.mgmt_store_id)), 'task_overdue',
        '【期限超過】' || case when r.is_decision then '会議の決定事項：' else 'タスク：' end || r.title,
        '期限 ' || to_char(r.due_date, 'YYYY-MM-DD') || '　担当 ' || coalesce((select name from mgmt.users where id = r.owner_user_id), ''), '/tasks', 'task:' || r.id || ':overdue');
    end if;
  end loop;

  -- 6. 週次：年5日の未達見込み（注意・警告・緊急）：本人・院長・GM・社長。段階が変わるたびに1回
  if v_weekly then
    for r in
      select u.id as user_id, u.name, f, mgmt.primary_store_of(u.id) as store_id
      from mgmt.users u cross join lateral mgmt.five_day_status(u.id, v_today) f
      where u.status = 'active' and (f ->> 'target')::boolean and f ->> 'level' in ('caution','warning','urgent')
    loop
      n_five := n_five + mgmt.notify_many(array[r.user_id] || array(select mgmt.store_managers(r.store_id))
          || array(select mgmt.users_with_global_role('GM')) || array(select mgmt.users_with_global_role('PRESIDENT')),
        'five_day', case r.f ->> 'level' when 'urgent' then '【緊急】' when 'warning' then '【警告】' else '【注意】' end
          || '有給の年5日の取得が足りない見込みです：' || r.name || 'さん',
        '取得済み ' || (r.f ->> 'taken') || '日・予定 ' || (r.f ->> 'planned') || '日／期限 ' || (r.f ->> 'period_end') || '（あと' || (r.f ->> 'days_left') || '日）',
        '/staff/' || r.user_id || '/leave', 'fivedays:' || r.user_id || ':' || (r.f ->> 'base_date') || ':' || (r.f ->> 'level'));
    end loop;
  end if;

  update mgmt.job_runs set finished_at = now(), result = jsonb_build_object(
    'taken_confirmed', v_taken, 'minutes', v_minutes, 'paid_expiring', n_expiring, 'shift_expired', n_expired,
    'tasks', n_task, 'five_day', n_five, 'weekly', v_weekly)
  where id = v_run;
  return (select result from mgmt.job_runs where id = v_run);
end $$;

-- 最後に動いた定期処理（社長の画面に表示）
create or replace function mgmt.last_job_run() returns table (job text, started_at timestamptz, finished_at timestamptz, result jsonb, error text)
language sql stable security definer set search_path = '' as $$
  select job, started_at, finished_at, result, error from mgmt.job_runs where mgmt.can('dashboard.president') or mgmt.can('master.manage')
  order by id desc limit 1
$$;
-- 定期処理の失敗を記録する（API から呼ぶ。サービスロール）
create or replace function mgmt.record_job_error(p_job text, p_error text) returns void
language sql security definer set search_path = '' as $$
  insert into mgmt.job_runs (job, finished_at, error) values (p_job, now(), left(p_error, 2000))
$$;

revoke execute on all functions in schema mgmt from public, anon;
grant execute on function mgmt.store_kpis(date), mgmt.last_job_run(), mgmt.can_view_leave_of(uuid) to authenticated;
-- 定期処理はサービスロールだけ
revoke execute on function mgmt.run_daily_jobs(boolean), mgmt.record_job_error(text, text), mgmt.notify_many(uuid[], text, text, text, text, text) from authenticated;
grant execute on all functions in schema mgmt to service_role;
