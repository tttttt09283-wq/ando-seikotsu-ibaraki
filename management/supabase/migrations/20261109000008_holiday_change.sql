-- AND GROUP MANAGEMENT SYSTEM — PHASE 6：振休からアルバイト勤務への変更（二段階承認）
-- 設計：docs/workflows.md §4（院長申請 → GM事前確認 → 社長最終承認 → 変更確定）
-- ・GMの確認が終わるまで、社長の承認ステップは「待機（waiting）」で、DB が社長の承認を拒否する（T-05）
-- ・変更が確定するまで、振休は振休のまま（勤務区分を変えない）
-- ・確定したら、その日の振休は「使ったことにする」（Q-8 決定：残数に戻さない）→ 取得予定を converted（勤務に変更・消費）にする
-- ・対象は、承認済みの振休の取得予定（leave_usage が planned のもの）

-- 取得の状態に「勤務に変更（消費）」を追加。残数の計算では取得済みと同じく消費として数える
alter table mgmt.leave_usage drop constraint leave_usage_status_check;
alter table mgmt.leave_usage add constraint leave_usage_status_check check (status in ('planned','taken','cancelled','converted'));

create or replace function mgmt.leave_grant_state(p_user uuid, p_type uuid, p_as_of date default mgmt.jst_today())
returns table (
  grant_id uuid, grant_date date, expires_on date, source text, days numeric, adjusted numeric,
  taken numeric, planned numeric, remaining numeric, state text
)
language sql stable security definer set search_path = '' as $$
  select g.id, g.grant_date, g.expires_on, g.source, g.days,
    coalesce((select sum(a.delta_days) from mgmt.leave_adjustments a where a.leave_grant_id = g.id), 0),
    coalesce((select sum(u.days) from mgmt.leave_usage u where u.leave_grant_id = g.id and u.status in ('taken','converted')), 0),
    coalesce((select sum(u.days) from mgmt.leave_usage u where u.leave_grant_id = g.id and u.status = 'planned'), 0),
    g.days
      + coalesce((select sum(a.delta_days) from mgmt.leave_adjustments a where a.leave_grant_id = g.id), 0)
      - coalesce((select sum(u.days) from mgmt.leave_usage u where u.leave_grant_id = g.id and u.status in ('taken','planned','converted')), 0),
    case
      when g.grant_date > p_as_of then 'future'
      when g.expires_on >= p_as_of then 'active'
      when (mgmt.leave_policy_at(g.leave_type_id, g.grant_date)).on_expiry = 'alert_only' then 'expired_alert'
      else 'expired_lapsed'
    end
  from mgmt.leave_grants g
  where g.user_id = p_user and g.leave_type_id = p_type and g.voided_at is null
    and mgmt.can_view_leave_of(p_user)
  order by g.expires_on, g.grant_date
$$;

-- ===== 変更申請 =====
create table mgmt.holiday_change_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references mgmt.stores(id),
  target_user_id uuid not null references mgmt.users(id),       -- 振休を勤務に変える人
  leave_usage_id uuid not null references mgmt.leave_usage(id), -- 変更する振休の取得予定
  shift_holiday_date date not null,                             -- その振休の日（＝勤務する日）
  start_time time not null,
  end_time time not null,
  break_minutes int not null default 0 check (break_minutes between 0 and 240),
  reason text not null check (length(btrim(reason)) between 2 and 500),
  status text not null default 'pending_gm' check (status in ('pending_gm','pending_president','returned','approved','rejected','withdrawn')),
  requested_by uuid not null references mgmt.users(id),
  submit_count int not null default 1,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (end_time > start_time)
);
create index on mgmt.holiday_change_requests (store_id, status);
-- 同じ振休に、進行中の変更申請は1件だけ
create unique index holiday_change_one_active on mgmt.holiday_change_requests (leave_usage_id)
  where status in ('pending_gm','pending_president','returned','approved');
create trigger audit after insert or update or delete on mgmt.holiday_change_requests for each row execute function mgmt.audit_trigger();

alter table mgmt.approval_steps add column holiday_change_request_id uuid references mgmt.holiday_change_requests(id);
alter table mgmt.approval_steps drop constraint approval_steps_one_request;
alter table mgmt.approval_steps add constraint approval_steps_one_request check (num_nonnulls(leave_request_id, part_time_request_id, holiday_change_request_id) = 1);
alter table mgmt.approval_steps add constraint approval_steps_holiday_change_no unique (holiday_change_request_id, step_no);
alter table mgmt.approval_steps drop constraint approval_steps_step_kind_check;
alter table mgmt.approval_steps add constraint approval_steps_step_kind_check check (step_kind in ('president_final','manager_final','gm_review'));
alter table mgmt.approval_events drop constraint approval_events_request_kind_check;
alter table mgmt.approval_events add constraint approval_events_request_kind_check check (request_kind in ('leave','part_time','holiday_change'));

create or replace function mgmt.holiday_change_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'target', (select name from mgmt.users where id = r.target_user_id), 'date', r.shift_holiday_date,
    'start_time', r.start_time, 'end_time', r.end_time, 'break_minutes', r.break_minutes,
    'minutes', mgmt.work_minutes(r.start_time, r.end_time, r.break_minutes), 'reason', r.reason, 'status', r.status,
    'usage_status', (select status from mgmt.leave_usage where id = r.leave_usage_id)
  ) from mgmt.holiday_change_requests r where r.id = p_id
$$;

-- 承認ステップ：①GM事前確認（pending）②社長最終承認（waiting：①が終わるまで操作できない）
create or replace function mgmt.open_holiday_change_steps(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r mgmt.holiday_change_requests; v_no int; v_step uuid; v_name text;
begin
  select * into r from mgmt.holiday_change_requests where id = p_id;
  select coalesce(max(step_no), 0) into v_no from mgmt.approval_steps where holiday_change_request_id = p_id;
  insert into mgmt.approval_steps (holiday_change_request_id, step_no, step_kind, status) values (p_id, v_no + 1, 'gm_review', 'pending') returning id into v_step;
  insert into mgmt.approval_steps (holiday_change_request_id, step_no, step_kind, status) values (p_id, v_no + 2, 'president_final', 'waiting');
  select name into v_name from mgmt.users where id = r.target_user_id;
  perform mgmt.notify(x, 'approval_request', '振休→アルバイト勤務の確認依頼：' || v_name || 'さん',
    r.shift_holiday_date || ' ' || to_char(r.start_time, 'HH24:MI') || '〜' || to_char(r.end_time, 'HH24:MI'), '/holiday-change/' || p_id, 'approval:' || v_step || ':requested')
  from mgmt.users_with_global_role('GM') x;
end $$;

create or replace function mgmt.check_holiday_change_target(p_store uuid, p_usage uuid, p_except uuid) returns mgmt.leave_usage
language plpgsql stable security definer set search_path = '' as $$
declare u mgmt.leave_usage; v_code text;
begin
  select * into u from mgmt.leave_usage where id = p_usage;
  if u.id is null then raise exception '変更する振休が見つかりません'; end if;
  select code into v_code from mgmt.leave_types where id = u.leave_type_id;
  if v_code not in ('SHIFT','SHIFT_HOLIDAY') then raise exception '変更できるのは振休（振替・祝振替）の取得予定だけです'; end if;
  if u.status <> 'planned' then raise exception 'この振休は取得予定ではありません（取得済み・取消済み・変更済み）'; end if;
  if u.usage_date < mgmt.jst_today() then raise exception '過ぎた日の振休は変更できません'; end if;
  if not exists (select 1 from mgmt.user_store_assignments a where a.user_id = u.user_id and a.store_id = p_store and mgmt.is_current(a.starts_on, a.ends_on)) then
    raise exception 'この院のスタッフの振休ではありません';
  end if;
  if exists (select 1 from mgmt.holiday_change_requests h where h.leave_usage_id = p_usage
             and h.status in ('pending_gm','pending_president','returned','approved') and (p_except is null or h.id <> p_except)) then
    raise exception 'この振休にはすでに変更の申請があります';
  end if;
  return u;
end $$;

-- 申請（院長）
create or replace function mgmt.submit_holiday_change(
  p_store uuid, p_usage uuid, p_start time, p_end time, p_break int, p_reason text, p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); u mgmt.leave_usage; v_id uuid;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_idempotency_key is not null and exists (select 1 from mgmt.approval_events where idempotency_key = p_idempotency_key) then
    return (select request_id from mgmt.approval_events where idempotency_key = p_idempotency_key);
  end if;
  if not mgmt.can('holidaychange.request', p_store) then raise exception '振休の勤務変更を申請できるのは、その院の院長です' using errcode = '42501'; end if;
  if p_end <= p_start or mgmt.work_minutes(p_start, p_end, coalesce(p_break, 0)) <= 0 then raise exception '勤務時間が正しくありません'; end if;
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '申請理由を入力してください'; end if;
  u := mgmt.check_holiday_change_target(p_store, p_usage, null);
  insert into mgmt.holiday_change_requests (store_id, target_user_id, leave_usage_id, shift_holiday_date, start_time, end_time, break_minutes, reason, requested_by)
  values (p_store, u.user_id, u.id, u.usage_date, p_start, p_end, coalesce(p_break, 0), btrim(p_reason), v_me)
  returning id into v_id;
  perform mgmt.open_holiday_change_steps(v_id);
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot, idempotency_key)
  values ('holiday_change', v_id, 'submit', v_me, mgmt.holiday_change_snapshot(v_id), p_idempotency_key);
  return v_id;
end $$;

-- 承認・差戻し・却下（①GM ②社長。②は①の承認後だけ）
create or replace function mgmt.decide_holiday_change_step(
  p_step uuid, p_action text, p_reason text default null, p_expected_version int default null, p_idempotency_key text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); s mgmt.approval_steps; r mgmt.holiday_change_requests; v_next uuid; v_name text; v_status text;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_action not in ('approve','return','reject') then raise exception '操作が正しくありません'; end if;
  if p_idempotency_key is not null and exists (select 1 from mgmt.approval_events where idempotency_key = p_idempotency_key) then
    return (select r2.status from mgmt.holiday_change_requests r2 join mgmt.approval_events e on e.request_id = r2.id where e.idempotency_key = p_idempotency_key);
  end if;
  select * into s from mgmt.approval_steps where id = p_step for update;
  if s.id is null or s.holiday_change_request_id is null then raise exception '承認の依頼が見つかりません'; end if;
  select * into r from mgmt.holiday_change_requests where id = s.holiday_change_request_id for update;
  -- 順序：社長のステップは、GMの確認が終わるまで「待機」で操作できない
  if s.status = 'waiting' then raise exception 'GMの事前確認が終わっていないため、まだ承認できません'; end if;
  if s.status <> 'pending' or r.status not in ('pending_gm','pending_president') then raise exception 'この申請はすでに処理されています'; end if;
  if p_expected_version is not null and p_expected_version <> s.version then raise exception 'ほかの人が先に処理しました。画面を更新してください'; end if;
  if s.step_kind = 'gm_review' then
    if not mgmt.can('holidaychange.gm_review') then raise exception '事前確認ができるのはGMです' using errcode = '42501'; end if;
  else
    if not mgmt.can('holidaychange.final_approve') then raise exception '最終承認ができるのは社長だけです' using errcode = '42501'; end if;
    if not exists (select 1 from mgmt.approval_steps g where g.holiday_change_request_id = r.id and g.step_kind = 'gm_review' and g.status = 'approved' and g.step_no < s.step_no) then
      raise exception 'GMの事前確認が終わっていないため、まだ承認できません';
    end if;
  end if;
  if v_me in (r.requested_by, r.target_user_id) then raise exception '自分が関わる申請は承認できません' using errcode = '42501'; end if;
  if p_action in ('return','reject') and (p_reason is null or length(btrim(p_reason)) < 2) then raise exception '差戻し・却下の理由を入力してください'; end if;

  update mgmt.approval_steps set status = case p_action when 'approve' then 'approved' when 'return' then 'returned' else 'rejected' end,
    decided_by = v_me, decided_at = now(), comment = nullif(btrim(p_reason), ''), version = version + 1 where id = s.id;
  select name into v_name from mgmt.users where id = r.target_user_id;

  if p_action = 'approve' and s.step_kind = 'gm_review' then
    update mgmt.approval_steps set status = 'pending', version = version + 1
    where holiday_change_request_id = r.id and step_kind = 'president_final' and status = 'waiting' returning id into v_next;
    update mgmt.holiday_change_requests set status = 'pending_president', updated_at = now(), version = version + 1 where id = r.id;
    perform mgmt.notify(x, 'approval_request', '振休→アルバイト勤務の承認依頼（GM確認済み）：' || v_name || 'さん',
      r.shift_holiday_date || ' ' || to_char(r.start_time, 'HH24:MI') || '〜' || to_char(r.end_time, 'HH24:MI'), '/holiday-change/' || r.id, 'approval:' || v_next || ':requested')
    from mgmt.users_with_global_role('PRESIDENT') x;
    v_status := 'pending_president';
  elsif p_action = 'approve' then
    -- 最終承認：振休の取得予定を「勤務に変更（消費）」にする（同じトランザクション）
    perform pg_advisory_xact_lock(hashtextextended('leave:' || r.target_user_id::text, 0));
    if not exists (select 1 from mgmt.leave_usage where id = r.leave_usage_id and status = 'planned') then
      raise exception '対象の振休がすでに取消・変更されているため、承認できません';
    end if;
    update mgmt.leave_usage set status = 'converted', updated_at = now(), version = version + 1 where id = r.leave_usage_id;
    update mgmt.holiday_change_requests set status = 'approved', decided_at = now(), updated_at = now(), version = version + 1 where id = r.id;
    perform mgmt.notify(x, 'holiday_change_decided', '振休→アルバイト勤務の変更が確定しました：' || v_name || 'さん ' || r.shift_holiday_date,
      to_char(r.start_time, 'HH24:MI') || '〜' || to_char(r.end_time, 'HH24:MI') || '（振休は使ったことになります）', '/holiday-change/' || r.id, 'approval:' || s.id || ':approve')
    from (select r.requested_by x union select r.target_user_id union select mgmt.users_with_global_role('GM')) w;
    v_status := 'approved';
  else
    update mgmt.approval_steps set status = 'cancelled', version = version + 1 where holiday_change_request_id = r.id and status = 'waiting';
    v_status := case p_action when 'return' then 'returned' else 'rejected' end;
    update mgmt.holiday_change_requests set status = v_status, decided_at = now(), updated_at = now(), version = version + 1 where id = r.id;
    perform mgmt.notify(r.requested_by, 'holiday_change_decided', '振休→アルバイト勤務の申請が' || case p_action when 'return' then '差戻し' else '却下' end || 'されました（' ||
      case s.step_kind when 'gm_review' then 'GM' else '社長' end || '）', btrim(p_reason), '/holiday-change/' || r.id, 'approval:' || s.id || ':' || p_action);
  end if;
  insert into mgmt.approval_events (request_kind, request_id, step_id, action, actor_user_id, reason, snapshot, idempotency_key)
  values ('holiday_change', r.id, s.id, p_action, v_me, nullif(btrim(p_reason), ''), mgmt.holiday_change_snapshot(r.id), p_idempotency_key);
  return v_status;
end $$;

-- 差戻し後の再申請（GMの確認からやり直し）
create or replace function mgmt.resubmit_holiday_change(p_id uuid, p_start time, p_end time, p_break int, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.holiday_change_requests;
begin
  select * into r from mgmt.holiday_change_requests where id = p_id for update;
  if r.id is null or not mgmt.can('holidaychange.request', r.store_id) then raise exception '申請が見つかりません'; end if;
  if r.status <> 'returned' then raise exception '再申請できるのは差戻しされた申請だけです'; end if;
  if p_end <= p_start or mgmt.work_minutes(p_start, p_end, coalesce(p_break, 0)) <= 0 then raise exception '勤務時間が正しくありません'; end if;
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '申請理由を入力してください'; end if;
  perform mgmt.check_holiday_change_target(r.store_id, r.leave_usage_id, r.id);
  update mgmt.holiday_change_requests set start_time = p_start, end_time = p_end, break_minutes = coalesce(p_break, 0), reason = btrim(p_reason),
    status = 'pending_gm', submit_count = submit_count + 1, decided_at = null, updated_at = now(), version = version + 1 where id = p_id;
  perform mgmt.open_holiday_change_steps(p_id);
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('holiday_change', p_id, 'resubmit', v_me, mgmt.holiday_change_snapshot(p_id));
  return p_id;
end $$;

create or replace function mgmt.withdraw_holiday_change(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.holiday_change_requests;
begin
  select * into r from mgmt.holiday_change_requests where id = p_id for update;
  if r.id is null or not mgmt.can('holidaychange.request', r.store_id) then raise exception '申請が見つかりません'; end if;
  if r.status not in ('pending_gm','pending_president','returned') then raise exception '取下げできるのは確定前の申請だけです'; end if;
  update mgmt.holiday_change_requests set status = 'withdrawn', updated_at = now(), version = version + 1 where id = p_id;
  update mgmt.approval_steps set status = 'cancelled', version = version + 1 where holiday_change_request_id = p_id and status in ('pending','waiting');
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('holiday_change', p_id, 'withdraw', v_me, mgmt.holiday_change_snapshot(p_id));
end $$;

-- 承認待ち（GM＝事前確認、社長＝GM確認済みの最終承認）
create or replace function mgmt.my_holiday_change_queue() returns table (
  step_id uuid, step_version int, step_kind text, request_id uuid, store_name text, target_name text, shift_holiday_date date,
  start_time time, end_time time, break_minutes int, minutes int, reason text, requested_by_name text, submitted_at timestamptz, gm_comment text
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.version, s.step_kind, r.id, st.name, t.name, r.shift_holiday_date, r.start_time, r.end_time, r.break_minutes,
    mgmt.work_minutes(r.start_time, r.end_time, r.break_minutes), r.reason, rb.name, r.updated_at,
    (select g.comment from mgmt.approval_steps g where g.holiday_change_request_id = r.id and g.step_kind = 'gm_review' and g.status = 'approved' order by g.step_no desc limit 1)
  from mgmt.approval_steps s
  join mgmt.holiday_change_requests r on r.id = s.holiday_change_request_id
  join mgmt.stores st on st.id = r.store_id
  join mgmt.users t on t.id = r.target_user_id
  join mgmt.users rb on rb.id = r.requested_by
  where s.status = 'pending' and mgmt.current_user_id() not in (r.requested_by, r.target_user_id)
    and ((s.step_kind = 'gm_review' and r.status = 'pending_gm' and mgmt.can('holidaychange.gm_review'))
      or (s.step_kind = 'president_final' and r.status = 'pending_president' and mgmt.can('holidaychange.final_approve')))
  order by r.shift_holiday_date, r.created_at
$$;

-- 申請の候補：院の、変更できる振休の取得予定
create or replace function mgmt.holiday_change_candidates(p_store uuid) returns table (
  usage_id uuid, user_id uuid, user_name text, usage_date date, type_code text, leave_request_id uuid
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.user_id, us.name, u.usage_date, t.code, u.leave_request_id
  from mgmt.leave_usage u
  join mgmt.leave_types t on t.id = u.leave_type_id and t.code in ('SHIFT','SHIFT_HOLIDAY')
  join mgmt.users us on us.id = u.user_id and us.status = 'active'
  where mgmt.can('holidaychange.request', p_store) and u.status = 'planned' and u.usage_date >= mgmt.jst_today()
    and exists (select 1 from mgmt.user_store_assignments a where a.user_id = u.user_id and a.store_id = p_store and mgmt.is_current(a.starts_on, a.ends_on))
    and not exists (select 1 from mgmt.holiday_change_requests h where h.leave_usage_id = u.id and h.status in ('pending_gm','pending_president','returned','approved'))
  order by u.usage_date, us.name
$$;

create or replace function mgmt.can_view_holiday_change(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from mgmt.holiday_change_requests r where r.id = p_id and (
      mgmt.can('holidaychange.request', r.store_id) or mgmt.can('holidaychange.gm_review') or mgmt.can('holidaychange.final_approve')
      or mgmt.can('staff.view.store', r.store_id) or r.target_user_id = mgmt.current_user_id()
    )
  )
$$;

-- 履歴（名前つき）に振休変更を追加
create or replace function mgmt.request_history(p_kind text, p_request uuid)
returns table (id bigint, action text, reason text, reason_category text, self_approved boolean, occurred_at timestamptz, actor_name text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.action, e.reason, e.reason_category, e.self_approved, e.occurred_at, u.name
  from mgmt.approval_events e
  left join mgmt.users u on u.id = e.actor_user_id
  where e.request_kind = p_kind and e.request_id = p_request
    and case p_kind when 'leave' then mgmt.can_view_leave_request(p_request)
                    when 'part_time' then mgmt.can_view_part_time(p_request)
                    when 'holiday_change' then mgmt.can_view_holiday_change(p_request) else false end
  order by e.id
$$;


-- 振休の取消：勤務に変更済み（converted）の日を含む申請は取り消せない（変更の確定を取り消すことになるため）
create or replace function mgmt.cancel_leave_request(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.leave_requests; v_taken boolean; v_is_approver boolean;
begin
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '取消の理由を入力してください'; end if;
  select * into r from mgmt.leave_requests where id = p_request for update;
  if r.id is null then raise exception '申請が見つかりません'; end if;
  if r.status <> 'approved' then raise exception '取消できるのは承認済みの申請だけです'; end if;
  perform pg_advisory_xact_lock(hashtextextended('leave:' || r.user_id::text, 0));
  if exists (select 1 from mgmt.leave_usage where leave_request_id = r.id and status = 'converted') then
    raise exception 'アルバイト勤務に変更済みの日を含むため、この申請は取り消せません';
  end if;
  v_taken := exists (select 1 from mgmt.leave_usage where leave_request_id = r.id and status = 'taken');
  v_is_approver := (r.kind = 'PAID' and mgmt.can('leave.paid.final_approve'))
                or (r.kind = 'SHIFT' and exists (select 1 from mgmt.store_managers(r.store_id) m where m = v_me));
  if v_taken then
    if not mgmt.can('leave.adjust') then raise exception '取得済みの日を含む申請の取消（実績の訂正）は社長が行います' using errcode = '42501'; end if;
  elsif not (v_me in (r.user_id, r.submitted_by) or v_is_approver) then
    raise exception 'この申請を取り消す権限がありません' using errcode = '42501';
  end if;
  update mgmt.leave_usage set status = 'cancelled', updated_at = now(), version = version + 1 where leave_request_id = r.id and status <> 'cancelled';
  update mgmt.leave_requests set status = 'cancelled', updated_at = now(), version = version + 1 where id = r.id;
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, reason, snapshot) values ('leave', r.id, 'cancel', v_me, btrim(p_reason), mgmt.leave_snapshot(r.id));
  perform mgmt.notify(r.user_id, 'leave_cancelled', mgmt.kind_label(r.kind) || 'の予定が取り消されました', btrim(p_reason), '/leave/' || r.id, 'leave:' || r.id || ':cancelled');
end $$;

-- ===== RLS =====
alter table mgmt.holiday_change_requests enable row level security;
create policy holiday_change_select on mgmt.holiday_change_requests for select to authenticated using (mgmt.can_view_holiday_change(id));
drop policy approval_steps_select on mgmt.approval_steps;
create policy approval_steps_select on mgmt.approval_steps for select to authenticated using (
  (leave_request_id is not null and mgmt.can_view_leave_request(leave_request_id))
  or (part_time_request_id is not null and mgmt.can_view_part_time(part_time_request_id))
  or (holiday_change_request_id is not null and mgmt.can_view_holiday_change(holiday_change_request_id))
);
drop policy approval_events_select on mgmt.approval_events;
create policy approval_events_select on mgmt.approval_events for select to authenticated using (
  (request_kind = 'leave' and mgmt.can_view_leave_request(request_id))
  or (request_kind = 'part_time' and mgmt.can_view_part_time(request_id))
  or (request_kind = 'holiday_change' and mgmt.can_view_holiday_change(request_id))
);

grant select on mgmt.holiday_change_requests to authenticated;
grant all on mgmt.holiday_change_requests to service_role;
revoke all on mgmt.holiday_change_requests from anon;

revoke execute on all functions in schema mgmt from public, anon;
grant execute on function
  mgmt.submit_holiday_change(uuid, uuid, time, time, int, text, text),
  mgmt.decide_holiday_change_step(uuid, text, text, int, text),
  mgmt.resubmit_holiday_change(uuid, time, time, int, text),
  mgmt.withdraw_holiday_change(uuid),
  mgmt.my_holiday_change_queue(),
  mgmt.holiday_change_candidates(uuid),
  mgmt.can_view_holiday_change(uuid),
  mgmt.request_history(text, uuid),
  mgmt.leave_grant_state(uuid, uuid, date),
  mgmt.cancel_leave_request(uuid, text)
  to authenticated;
grant execute on all functions in schema mgmt to service_role;
