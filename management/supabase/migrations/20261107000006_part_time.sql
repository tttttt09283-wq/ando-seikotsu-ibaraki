-- AND GROUP MANAGEMENT SYSTEM — PHASE 5：アルバイト勤務申請
-- 設計：docs/workflows.md §3（院長申請 → 社長が承認・差戻し・却下 → 勤務予定確定）
-- ・区分：plan（シフト作成前の計画）／help（急な欠員）／busy（土日祝・平日夜間の繁忙時間帯）
-- ・シフト確定の基準日：勤務する月の前月20日（Q-20。設定 shift_cutoff_day で変更可）。それより後の申請は例外申請（理由必須）
-- ・勤務する人はアルバイト雇用の人。人の登録は後で行うため、申請時は「未定」にでき、院長が後から設定できる（Q-8）
-- ・緊急（help）でも社長の承認が必要。承認前は勤務予定にならない

-- ===== 運用設定 =====
create table mgmt.settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null,
  description text,
  updated_by uuid references mgmt.users(id),
  updated_at timestamptz not null default now()
);
insert into mgmt.settings (key, value, description) values
  ('shift_cutoff_day', '20', 'シフト確定の基準日（勤務する月の前月の何日までの申請を「シフト作成前」とするか）。Q-20');
create trigger audit after insert or update or delete on mgmt.settings for each row execute function mgmt.audit_trigger();

create or replace function mgmt.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from mgmt.settings where key = p_key), p_default)
$$;

-- シフト確定の基準日（勤務日 → その前月の基準日）
create or replace function mgmt.shift_cutoff_for(p_work_date date) returns date
language sql stable security definer set search_path = '' as $$
  select (date_trunc('month', p_work_date) - interval '1 month')::date
         + (least(greatest(mgmt.setting_int('shift_cutoff_day', 20), 1), 28) - 1)
$$;

create or replace function mgmt.update_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not mgmt.can('master.manage') then raise exception '設定を変更できるのは社長だけです' using errcode = '42501'; end if;
  if p_key = 'shift_cutoff_day' and not (jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::int between 1 and 28) then
    raise exception '基準日は1〜28日で指定してください';
  end if;
  update mgmt.settings set value = p_value, updated_by = mgmt.current_user_id(), updated_at = now() where key = p_key;
  if not found then raise exception '設定が見つかりません'; end if;
end $$;

-- ===== アルバイト勤務申請 =====
create table mgmt.part_time_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references mgmt.stores(id),
  worker_user_id uuid references mgmt.users(id),        -- 勤務する人（未定のまま申請可：Q-8）
  category text not null check (category in ('plan','help','busy')),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes int not null default 0 check (break_minutes between 0 and 240),
  reason text not null check (length(btrim(reason)) between 2 and 500),
  is_exception boolean not null default false,          -- シフト確定後の申請
  exception_reason text check (exception_reason is null or length(exception_reason) <= 500),
  cutoff_date date not null,                            -- 申請時点の基準日（記録）
  status text not null default 'pending' check (status in ('pending','returned','approved','rejected','withdrawn','cancelled')),
  requested_by uuid not null references mgmt.users(id),
  submit_count int not null default 1,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (end_time > start_time),
  check (not is_exception or length(btrim(coalesce(exception_reason, ''))) >= 2)
);
create index on mgmt.part_time_requests (store_id, status, work_date);
create trigger audit after insert or update or delete on mgmt.part_time_requests for each row execute function mgmt.audit_trigger();

-- 承認ステップ・履歴を共用する（どちらか1つの申請だけを指す）
alter table mgmt.approval_steps add column part_time_request_id uuid references mgmt.part_time_requests(id);
alter table mgmt.approval_steps drop constraint approval_steps_leave_request_id_check;
alter table mgmt.approval_steps add constraint approval_steps_one_request check (num_nonnulls(leave_request_id, part_time_request_id) = 1);
alter table mgmt.approval_steps add constraint approval_steps_part_time_no unique (part_time_request_id, step_no);
alter table mgmt.approval_events drop constraint approval_events_request_kind_check;
alter table mgmt.approval_events add constraint approval_events_request_kind_check check (request_kind in ('leave','part_time'));
alter table mgmt.approval_events drop constraint approval_events_action_check;
alter table mgmt.approval_events add constraint approval_events_action_check
  check (action in ('submit','resubmit','approve','return','reject','withdraw','cancel','confirm_taken','assign_worker'));

-- 時間（分）
create or replace function mgmt.work_minutes(p_start time, p_end time, p_break int) returns int
language sql immutable set search_path = '' as $$
  select (extract(epoch from (p_end - p_start)) / 60)::int - p_break
$$;

-- 勤務する人の確認：その院（または兼務先）に所属するアルバイト雇用の人
create or replace function mgmt.check_part_time_worker(p_store uuid, p_worker uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_worker is null then return; end if;
  if not exists (
    select 1 from mgmt.users u where u.id = p_worker and u.status = 'active' and u.employment_type = 'アルバイト'
  ) then
    raise exception '勤務する人は、在籍中のアルバイト雇用の人から選んでください';
  end if;
end $$;

create or replace function mgmt.part_time_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'category', r.category, 'work_date', r.work_date, 'start_time', r.start_time, 'end_time', r.end_time,
    'break_minutes', r.break_minutes, 'minutes', mgmt.work_minutes(r.start_time, r.end_time, r.break_minutes),
    'worker', (select name from mgmt.users where id = r.worker_user_id), 'reason', r.reason,
    'is_exception', r.is_exception, 'exception_reason', r.exception_reason, 'cutoff_date', r.cutoff_date, 'status', r.status
  ) from mgmt.part_time_requests r where r.id = p_id
$$;

create or replace function mgmt.part_time_label(p_category text) returns text
language sql immutable set search_path = '' as $$
  select case p_category when 'plan' then '計画' when 'help' then '緊急ヘルプ' else '繁忙時間帯' end
$$;

create or replace function mgmt.open_part_time_step(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r mgmt.part_time_requests; v_step uuid; v_no int; v_store text;
begin
  select * into r from mgmt.part_time_requests where id = p_id;
  select coalesce(max(step_no), 0) + 1 into v_no from mgmt.approval_steps where part_time_request_id = p_id;
  insert into mgmt.approval_steps (part_time_request_id, step_no, step_kind) values (p_id, v_no, 'president_final') returning id into v_step;
  select name into v_store from mgmt.stores where id = r.store_id;
  perform mgmt.notify(x, 'approval_request',
    case when r.category = 'help' then '【緊急】' else '' end || 'アルバイト勤務の承認依頼：' || v_store,
    r.work_date || ' ' || to_char(r.start_time, 'HH24:MI') || '〜' || to_char(r.end_time, 'HH24:MI') || '（' || mgmt.part_time_label(r.category) || case when r.is_exception then '・シフト確定後' else '' end || '）',
    '/part-time/' || p_id, 'approval:' || v_step || ':requested')
  from mgmt.users_with_global_role('PRESIDENT') x;
  return v_step;
end $$;

-- 申請（院長）
create or replace function mgmt.submit_part_time_request(
  p_store uuid, p_category text, p_work_date date, p_start time, p_end time, p_break int,
  p_reason text, p_worker uuid default null, p_exception_reason text default null, p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v_cut date; v_exc boolean; v_id uuid;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_idempotency_key is not null and exists (select 1 from mgmt.approval_events where idempotency_key = p_idempotency_key) then
    return (select request_id from mgmt.approval_events where idempotency_key = p_idempotency_key);
  end if;
  if not mgmt.can('parttime.request', p_store) then raise exception 'この院のアルバイト勤務を申請できるのは、院長です' using errcode = '42501'; end if;
  if p_category not in ('plan','help','busy') then raise exception '申請区分を選んでください'; end if;
  if p_work_date < mgmt.jst_today() then raise exception '過去の日付には申請できません'; end if;
  if p_work_date > mgmt.jst_today() + 120 then raise exception '4か月より先の日付には申請できません'; end if;
  if p_end <= p_start then raise exception '終了時刻は開始時刻より後にしてください'; end if;
  if mgmt.work_minutes(p_start, p_end, coalesce(p_break, 0)) <= 0 then raise exception '休憩が勤務時間より長くなっています'; end if;
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '申請理由を入力してください'; end if;
  perform mgmt.check_part_time_worker(p_store, p_worker);
  v_cut := mgmt.shift_cutoff_for(p_work_date);
  v_exc := mgmt.jst_today() > v_cut;
  if v_exc and (p_exception_reason is null or length(btrim(p_exception_reason)) < 2) then
    raise exception 'シフト確定後（%を過ぎています）の申請のため、例外申請の理由を入力してください', v_cut;
  end if;
  insert into mgmt.part_time_requests (store_id, worker_user_id, category, work_date, start_time, end_time, break_minutes, reason, is_exception, exception_reason, cutoff_date, requested_by)
  values (p_store, p_worker, p_category, p_work_date, p_start, p_end, coalesce(p_break, 0), btrim(p_reason), v_exc, case when v_exc then btrim(p_exception_reason) end, v_cut, v_me)
  returning id into v_id;
  perform mgmt.open_part_time_step(v_id);
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot, idempotency_key)
  values ('part_time', v_id, 'submit', v_me, mgmt.part_time_snapshot(v_id), p_idempotency_key);
  return v_id;
end $$;

-- 承認・差戻し・却下（社長だけ）
create or replace function mgmt.decide_part_time_step(
  p_step uuid, p_action text, p_reason text default null, p_expected_version int default null, p_idempotency_key text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); s mgmt.approval_steps; r mgmt.part_time_requests; v_new text;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_action not in ('approve','return','reject') then raise exception '操作が正しくありません'; end if;
  if p_idempotency_key is not null and exists (select 1 from mgmt.approval_events where idempotency_key = p_idempotency_key) then
    return (select r2.status from mgmt.part_time_requests r2 join mgmt.approval_events e on e.request_id = r2.id where e.idempotency_key = p_idempotency_key);
  end if;
  select * into s from mgmt.approval_steps where id = p_step for update;
  if s.id is null or s.part_time_request_id is null then raise exception '承認の依頼が見つかりません'; end if;
  select * into r from mgmt.part_time_requests where id = s.part_time_request_id for update;
  if s.status <> 'pending' or r.status <> 'pending' then raise exception 'この申請はすでに処理されています'; end if;
  if p_expected_version is not null and p_expected_version <> s.version then raise exception 'ほかの人が先に処理しました。画面を更新してください'; end if;
  if not mgmt.can('parttime.final_approve') then raise exception 'アルバイト勤務を承認できるのは社長だけです' using errcode = '42501'; end if;
  if v_me = r.requested_by then raise exception '自分の申請は承認できません' using errcode = '42501'; end if;
  if p_action in ('return','reject') and (p_reason is null or length(btrim(p_reason)) < 2) then raise exception '差戻し・却下の理由を入力してください'; end if;
  v_new := case p_action when 'approve' then 'approved' when 'return' then 'returned' else 'rejected' end;
  update mgmt.part_time_requests set status = v_new, decided_at = now(), updated_at = now(), version = version + 1 where id = r.id;
  update mgmt.approval_steps set status = v_new, decided_by = v_me, decided_at = now(), comment = nullif(btrim(p_reason), ''), version = version + 1 where id = s.id;
  insert into mgmt.approval_events (request_kind, request_id, step_id, action, actor_user_id, reason, snapshot, idempotency_key)
  values ('part_time', r.id, s.id, p_action, v_me, nullif(btrim(p_reason), ''), mgmt.part_time_snapshot(r.id), p_idempotency_key);
  perform mgmt.notify(r.requested_by, 'part_time_decided',
    'アルバイト勤務（' || r.work_date || '）が' || case p_action when 'approve' then '承認されました（勤務予定に確定）' when 'return' then '差戻しされました' else '却下されました' end,
    nullif(btrim(p_reason), ''), '/part-time/' || r.id, 'approval:' || s.id || ':' || p_action);
  if p_action = 'approve' and r.worker_user_id is not null then
    perform mgmt.notify(r.worker_user_id, 'part_time_confirmed', 'アルバイト勤務が確定しました：' || r.work_date,
      to_char(r.start_time, 'HH24:MI') || '〜' || to_char(r.end_time, 'HH24:MI'), '/part-time/' || r.id, 'part_time:' || r.id || ':confirmed:' || r.worker_user_id);
  end if;
  return v_new;
end $$;

-- 差戻し後の再申請（院長）
create or replace function mgmt.resubmit_part_time_request(
  p_id uuid, p_category text, p_work_date date, p_start time, p_end time, p_break int, p_reason text,
  p_worker uuid default null, p_exception_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.part_time_requests; v_cut date; v_exc boolean;
begin
  select * into r from mgmt.part_time_requests where id = p_id for update;
  if r.id is null or not mgmt.can('parttime.request', r.store_id) then raise exception '申請が見つかりません'; end if;
  if r.status <> 'returned' then raise exception '再申請できるのは差戻しされた申請だけです'; end if;
  if p_category not in ('plan','help','busy') then raise exception '申請区分を選んでください'; end if;
  if p_work_date < mgmt.jst_today() then raise exception '過去の日付には申請できません'; end if;
  if p_end <= p_start or mgmt.work_minutes(p_start, p_end, coalesce(p_break, 0)) <= 0 then raise exception '勤務時間が正しくありません'; end if;
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '申請理由を入力してください'; end if;
  perform mgmt.check_part_time_worker(r.store_id, p_worker);
  v_cut := mgmt.shift_cutoff_for(p_work_date);
  v_exc := mgmt.jst_today() > v_cut;
  if v_exc and (p_exception_reason is null or length(btrim(p_exception_reason)) < 2) then
    raise exception 'シフト確定後（%を過ぎています）の申請のため、例外申請の理由を入力してください', v_cut;
  end if;
  update mgmt.part_time_requests set category = p_category, work_date = p_work_date, start_time = p_start, end_time = p_end,
    break_minutes = coalesce(p_break, 0), reason = btrim(p_reason), worker_user_id = p_worker, is_exception = v_exc,
    exception_reason = case when v_exc then btrim(p_exception_reason) end, cutoff_date = v_cut,
    status = 'pending', submit_count = submit_count + 1, decided_at = null, updated_at = now(), version = version + 1
  where id = p_id;
  perform mgmt.open_part_time_step(p_id);
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('part_time', p_id, 'resubmit', v_me, mgmt.part_time_snapshot(p_id));
  return p_id;
end $$;

-- 勤務する人を後から設定・変更（院長）。承認済みの場合は社長に通知
create or replace function mgmt.assign_part_time_worker(p_id uuid, p_worker uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.part_time_requests; v_name text;
begin
  select * into r from mgmt.part_time_requests where id = p_id for update;
  if r.id is null or not mgmt.can('parttime.request', r.store_id) then raise exception 'この申請の勤務者を設定する権限がありません' using errcode = '42501'; end if;
  if r.status not in ('pending','returned','approved') then raise exception 'この申請の勤務者は変更できません'; end if;
  if r.work_date < mgmt.jst_today() then raise exception '勤務日を過ぎた申請の勤務者は変更できません'; end if;
  perform mgmt.check_part_time_worker(r.store_id, p_worker);
  update mgmt.part_time_requests set worker_user_id = p_worker, updated_at = now(), version = version + 1 where id = p_id;
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('part_time', p_id, 'assign_worker', v_me, mgmt.part_time_snapshot(p_id));
  select name into v_name from mgmt.users where id = p_worker;
  if r.status = 'approved' then
    perform mgmt.notify(x, 'part_time_worker', 'アルバイト勤務の勤務者が設定されました：' || r.work_date, coalesce(v_name, '未定'), '/part-time/' || p_id,
      'part_time:' || p_id || ':worker:' || coalesce(p_worker::text, 'none') || ':' || r.version)
    from mgmt.users_with_global_role('PRESIDENT') x;
    if p_worker is not null then
      perform mgmt.notify(p_worker, 'part_time_confirmed', 'アルバイト勤務が確定しました：' || r.work_date,
        to_char(r.start_time, 'HH24:MI') || '〜' || to_char(r.end_time, 'HH24:MI'), '/part-time/' || p_id, 'part_time:' || p_id || ':confirmed:' || p_worker);
    end if;
  end if;
end $$;

-- 取下げ（承認前）・取消（承認済み、理由必須。勤務日を過ぎたら社長だけ）
create or replace function mgmt.withdraw_part_time_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.part_time_requests;
begin
  select * into r from mgmt.part_time_requests where id = p_id for update;
  if r.id is null or not mgmt.can('parttime.request', r.store_id) then raise exception '申請が見つかりません'; end if;
  if r.status not in ('pending','returned') then raise exception '取下げできるのは承認前の申請だけです'; end if;
  update mgmt.part_time_requests set status = 'withdrawn', updated_at = now(), version = version + 1 where id = p_id;
  update mgmt.approval_steps set status = 'cancelled', version = version + 1 where part_time_request_id = p_id and status = 'pending';
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('part_time', p_id, 'withdraw', v_me, mgmt.part_time_snapshot(p_id));
end $$;

create or replace function mgmt.cancel_part_time_request(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.part_time_requests;
begin
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '取消の理由を入力してください'; end if;
  select * into r from mgmt.part_time_requests where id = p_id for update;
  if r.id is null then raise exception '申請が見つかりません'; end if;
  if r.status <> 'approved' then raise exception '取消できるのは承認済みの申請だけです'; end if;
  if r.work_date < mgmt.jst_today() then
    if not mgmt.can('parttime.final_approve') then raise exception '勤務日を過ぎた申請の取消は社長が行います' using errcode = '42501'; end if;
  elsif not (mgmt.can('parttime.request', r.store_id) or mgmt.can('parttime.final_approve')) then
    raise exception 'この申請を取り消す権限がありません' using errcode = '42501';
  end if;
  update mgmt.part_time_requests set status = 'cancelled', updated_at = now(), version = version + 1 where id = p_id;
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, reason, snapshot) values ('part_time', p_id, 'cancel', v_me, btrim(p_reason), mgmt.part_time_snapshot(p_id));
  perform mgmt.notify(x, 'part_time_cancelled', 'アルバイト勤務（' || r.work_date || '）が取り消されました', btrim(p_reason), '/part-time/' || p_id, 'part_time:' || p_id || ':cancelled')
  from (select r.requested_by x union select mgmt.users_with_global_role('PRESIDENT') union select r.worker_user_id where r.worker_user_id is not null) w
  where x <> v_me;
end $$;

-- 社長の承認待ち（アルバイト勤務）。緊急を先に
create or replace function mgmt.my_part_time_queue() returns table (
  step_id uuid, step_version int, request_id uuid, store_name text, category text, work_date date, start_time time, end_time time,
  break_minutes int, minutes int, worker_name text, reason text, is_exception boolean, exception_reason text, cutoff_date date,
  requested_by_name text, submitted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.version, r.id, st.name, r.category, r.work_date, r.start_time, r.end_time, r.break_minutes,
    mgmt.work_minutes(r.start_time, r.end_time, r.break_minutes), w.name, r.reason, r.is_exception, r.exception_reason, r.cutoff_date,
    rb.name, r.updated_at
  from mgmt.approval_steps s
  join mgmt.part_time_requests r on r.id = s.part_time_request_id and r.status = 'pending'
  join mgmt.stores st on st.id = r.store_id
  join mgmt.users rb on rb.id = r.requested_by
  left join mgmt.users w on w.id = r.worker_user_id
  where s.status = 'pending' and mgmt.can('parttime.final_approve') and r.requested_by <> mgmt.current_user_id()
  order by (r.category = 'help') desc, r.work_date, r.created_at
$$;

-- 見る権限：その院の院長・BM（担当エリア）・社長・GM・勤務する本人
create or replace function mgmt.can_view_part_time(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from mgmt.part_time_requests r where r.id = p_id and (
      mgmt.can('parttime.request', r.store_id) or mgmt.can('parttime.final_approve') or mgmt.can('staff.view.store', r.store_id)
      or r.worker_user_id = mgmt.current_user_id()
    )
  )
$$;

-- ===== RLS =====
alter table mgmt.settings enable row level security;
alter table mgmt.part_time_requests enable row level security;
create policy settings_select on mgmt.settings for select to authenticated using (mgmt.current_user_id() is not null);
create policy part_time_select on mgmt.part_time_requests for select to authenticated using (mgmt.can_view_part_time(id));
drop policy approval_steps_select on mgmt.approval_steps;
create policy approval_steps_select on mgmt.approval_steps for select to authenticated using (
  (leave_request_id is not null and mgmt.can_view_leave_request(leave_request_id))
  or (part_time_request_id is not null and mgmt.can_view_part_time(part_time_request_id))
);
drop policy approval_events_select on mgmt.approval_events;
create policy approval_events_select on mgmt.approval_events for select to authenticated using (
  (request_kind = 'leave' and mgmt.can_view_leave_request(request_id))
  or (request_kind = 'part_time' and mgmt.can_view_part_time(request_id))
);

grant select on mgmt.settings, mgmt.part_time_requests to authenticated;
grant all on mgmt.settings, mgmt.part_time_requests to service_role;
revoke all on mgmt.settings, mgmt.part_time_requests from anon;

revoke execute on all functions in schema mgmt from public, anon;
grant execute on function
  mgmt.shift_cutoff_for(date), mgmt.update_setting(text, jsonb),
  mgmt.submit_part_time_request(uuid, text, date, time, time, int, text, uuid, text, text),
  mgmt.decide_part_time_step(uuid, text, text, int, text),
  mgmt.resubmit_part_time_request(uuid, text, date, time, time, int, text, uuid, text),
  mgmt.assign_part_time_worker(uuid, uuid),
  mgmt.withdraw_part_time_request(uuid),
  mgmt.cancel_part_time_request(uuid, text),
  mgmt.my_part_time_queue(),
  mgmt.can_view_part_time(uuid),
  mgmt.work_minutes(time, time, int)
  to authenticated;
grant execute on all functions in schema mgmt to service_role;
