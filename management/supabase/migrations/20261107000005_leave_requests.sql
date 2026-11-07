-- AND GROUP MANAGEMENT SYSTEM — PHASE 4：有給・振休の申請と承認
-- 設計：docs/workflows.md §1・§2、docs/permissions.md §4、docs/database.md §5
--
-- 有給：本人（または院長の代理）が申請 → 社長が 承認／差戻し／却下（却下は理由の区分が必須：Q-9）
-- 振休：本人が申請 → 承認院（主所属）の院長が承認。院長本人の振休は本人承認可（Q-1、GM・社長に通知）
-- ・状態の変更は RPC（security definer）だけ。テーブルへの直接書き込みは許可しない
-- ・承認は 行ロック＋バージョン＋冪等キー で二重承認・二重減算を防ぐ。残数の割り当ては承認と同じトランザクション
-- ・承認・却下などの操作は approval_events（追記のみ）に、申請内容と残数のスナップショット付きで残す

-- ===== 申請 =====
create table mgmt.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mgmt.users(id),          -- 休む人
  store_id uuid not null references mgmt.stores(id),        -- 承認の基準になる院（主所属）
  kind text not null check (kind in ('PAID','SHIFT')),      -- 有給／振休（振替・祝振替のどちらからも使う）
  dates date[] not null check (cardinality(dates) between 1 and 31),
  unit text not null default 'full' check (unit in ('full')),   -- 半日・時間単位は Q-3 で未確定
  total_days numeric(5,2) not null check (total_days > 0),
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending','returned','approved','rejected','withdrawn','cancelled')),
  balance_shortage boolean not null default false,          -- 申請時点で残数が足りなかった
  exception_note text check (exception_note is null or length(exception_note) <= 500),
  submitted_by uuid not null references mgmt.users(id),     -- 本人または代理の院長
  submit_count int not null default 1,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index on mgmt.leave_requests (user_id, status);
create index on mgmt.leave_requests (store_id, status);
alter table mgmt.leave_usage add constraint leave_usage_request_fk foreign key (leave_request_id) references mgmt.leave_requests(id);

-- ===== 承認ステップ（申請ごと） =====
create table mgmt.approval_steps (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid references mgmt.leave_requests(id),
  -- PHASE 5・6・8 でアルバイト勤務・振休変更・規定の申請の列を追加する（どれか1つだけ）
  step_no int not null,
  step_kind text not null check (step_kind in ('president_final','manager_final')),
  approver_store_id uuid references mgmt.stores(id),
  status text not null default 'pending' check (status in ('waiting','pending','approved','returned','rejected','cancelled')),
  decided_by uuid references mgmt.users(id),
  decided_at timestamptz,
  comment text,
  self_approved boolean not null default false,
  created_at timestamptz not null default now(),
  version int not null default 1,
  check (num_nonnulls(leave_request_id) = 1),
  unique (leave_request_id, step_no)
);
create index on mgmt.approval_steps (status, step_kind, approver_store_id);

-- ===== 承認操作の履歴（追記のみ） =====
create table mgmt.approval_events (
  id bigint generated always as identity primary key,
  request_kind text not null check (request_kind in ('leave')),
  request_id uuid not null,
  step_id uuid references mgmt.approval_steps(id),
  action text not null check (action in ('submit','resubmit','approve','return','reject','withdraw','cancel','confirm_taken')),
  actor_user_id uuid references mgmt.users(id),
  reason text,
  reason_category text,
  self_approved boolean not null default false,
  snapshot jsonb,
  idempotency_key text unique,
  occurred_at timestamptz not null default now()
);
create index on mgmt.approval_events (request_kind, request_id);
create trigger forbid_change before update or delete on mgmt.approval_events for each row execute function mgmt.forbid_change();

-- ===== アプリ内通知（同じ出来事の通知は1回だけ） =====
create table mgmt.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mgmt.users(id),
  kind text not null,
  title text not null,
  body text,
  link text,
  event_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index on mgmt.notifications (user_id, read_at);

create trigger audit after insert or update or delete on mgmt.leave_requests for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.approval_steps for each row execute function mgmt.audit_trigger();

-- ===== 共通の部品 =====
create or replace function mgmt.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_event_key text)
returns void language sql security definer set search_path = '' as $$
  insert into mgmt.notifications (user_id, kind, title, body, link, event_key)
  select p_user, p_kind, p_title, p_body, p_link, p_event_key
  where p_user is not null
  on conflict (user_id, event_key) do nothing
$$;

-- 役職の人（有効な社長・GM／ある院の院長）
create or replace function mgmt.users_with_global_role(p_role text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select ur.user_id from mgmt.user_roles ur join mgmt.roles r on r.id = ur.role_id and r.code = p_role
  join mgmt.users u on u.id = ur.user_id and u.status = 'active'
  where mgmt.is_current(ur.starts_on, ur.ends_on)
$$;
create or replace function mgmt.store_managers(p_store uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.user_id from mgmt.user_store_assignments a join mgmt.roles r on r.id = a.role_id and r.code = 'MANAGER'
  join mgmt.users u on u.id = a.user_id and u.status = 'active'
  where a.store_id = p_store and mgmt.is_current(a.starts_on, a.ends_on)
$$;

-- 主所属（無ければ最初の所属）
create or replace function mgmt.primary_store_of(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.store_id from mgmt.user_store_assignments a
  where a.user_id = p_user and mgmt.is_current(a.starts_on, a.ends_on)
  order by a.is_primary desc, a.starts_on limit 1
$$;

-- 申請の種類 → 使う休暇区分
create or replace function mgmt.leave_type_ids_for(p_kind text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from mgmt.leave_types where (p_kind = 'PAID' and code = 'PAID') or (p_kind = 'SHIFT' and code in ('SHIFT','SHIFT_HOLIDAY'))
$$;

-- 取得日 p_date に使える残り（承認済みの予定を差し引いた後）の合計
create or replace function mgmt.available_for(p_user uuid, p_kind text, p_date date) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.remaining), 0)
  from mgmt.leave_types t
  cross join lateral mgmt.leave_grant_state(p_user, t.id, p_date) s
  where t.id in (select mgmt.leave_type_ids_for(p_kind))
    and s.remaining > 0 and s.grant_date <= p_date and (s.expires_on >= p_date or s.state = 'expired_alert')
$$;

-- 申請中（承認待ち）の日数
create or replace function mgmt.pending_days(p_user uuid, p_kind text, p_except uuid default null) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(total_days), 0) from mgmt.leave_requests
  where user_id = p_user and kind = p_kind and status = 'pending' and (p_except is null or id <> p_except)
$$;

-- 申請の確認（日付・重複・残数）。問題があれば例外、残数不足は true を返す
create or replace function mgmt.check_leave_dates(p_user uuid, p_kind text, p_dates date[], p_except uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare d date; v_dup date; v_avail numeric;
begin
  if p_dates is null or cardinality(p_dates) = 0 then raise exception '休む日を選んでください'; end if;
  if cardinality(p_dates) > 31 then raise exception '1回の申請は31日までです'; end if;
  if (select count(distinct x) from unnest(p_dates) x) <> cardinality(p_dates) then raise exception '同じ日が2回選ばれています'; end if;
  foreach d in array p_dates loop
    if d < mgmt.jst_today() - 31 then raise exception '%は1か月以上前の日付です', d; end if;
    if d > mgmt.jst_today() + 366 then raise exception '%は1年より先の日付です', d; end if;
  end loop;
  -- 同じ日に、ほかの申請（承認待ち・承認済み）や取得予定がないか（二重申請の防止）
  select x into v_dup from unnest(p_dates) x
  where exists (select 1 from mgmt.leave_requests r where r.user_id = p_user and r.status in ('pending','approved','returned')
                  and (p_except is null or r.id <> p_except) and x = any(r.dates))
     or exists (select 1 from mgmt.leave_usage u where u.user_id = p_user and u.status <> 'cancelled' and u.usage_date = x)
  limit 1;
  if v_dup is not null then raise exception '%はすでに申請中か、取得予定があります', v_dup; end if;
  -- 残数（最後の日の時点で使える残り − ほかの承認待ち）
  v_avail := mgmt.available_for(p_user, p_kind, (select max(x) from unnest(p_dates) x)) - mgmt.pending_days(p_user, p_kind, p_except);
  return v_avail < cardinality(p_dates);
end $$;

create or replace function mgmt.leave_snapshot(p_request uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kind', r.kind, 'dates', r.dates, 'total_days', r.total_days, 'reason', r.reason, 'status', r.status,
    'balance_shortage', r.balance_shortage, 'exception_note', r.exception_note,
    'available', mgmt.available_for(r.user_id, r.kind, (select max(x) from unnest(r.dates) x)),
    'pending_other', mgmt.pending_days(r.user_id, r.kind, r.id)
  ) from mgmt.leave_requests r where r.id = p_request
$$;

create or replace function mgmt.kind_label(p_kind text) returns text
language sql immutable set search_path = '' as $$ select case p_kind when 'PAID' then '有給' else '振休' end $$;

-- 承認ステップを作り、承認者に通知する
create or replace function mgmt.open_leave_step(p_request uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r mgmt.leave_requests; v_step uuid; v_no int; v_who uuid; v_name text;
begin
  select * into r from mgmt.leave_requests where id = p_request;
  select coalesce(max(step_no), 0) + 1 into v_no from mgmt.approval_steps where leave_request_id = p_request;
  insert into mgmt.approval_steps (leave_request_id, step_no, step_kind, approver_store_id)
  values (p_request, v_no, case r.kind when 'PAID' then 'president_final' else 'manager_final' end, case r.kind when 'SHIFT' then r.store_id end)
  returning id into v_step;
  select name into v_name from mgmt.users where id = r.user_id;
  for v_who in
    select x from mgmt.users_with_global_role('PRESIDENT') x where r.kind = 'PAID'
    union select x from mgmt.store_managers(r.store_id) x where r.kind = 'SHIFT'
  loop
    perform mgmt.notify(v_who, 'approval_request', mgmt.kind_label(r.kind) || 'の承認依頼：' || v_name || 'さん',
      array_to_string(r.dates, '・') || '（' || r.total_days || '日）', '/approvals', 'approval:' || v_step || ':requested');
  end loop;
  return v_step;
end $$;

-- ===== 申請 =====
create or replace function mgmt.submit_leave_request(
  p_user uuid, p_kind text, p_dates date[], p_reason text default null, p_exception_note text default null, p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v_store uuid; v_short boolean; v_id uuid; v_dates date[];
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_kind not in ('PAID','SHIFT') then raise exception '申請の種類が正しくありません'; end if;
  if p_idempotency_key is not null and exists (select 1 from mgmt.approval_events where idempotency_key = p_idempotency_key) then
    select request_id into v_id from mgmt.approval_events where idempotency_key = p_idempotency_key;
    return v_id;   -- 二度押し：前回の申請を返す
  end if;
  if not exists (select 1 from mgmt.users where id = p_user and status = 'active') then raise exception 'スタッフが見つかりません'; end if;
  v_store := mgmt.primary_store_of(p_user);
  if v_store is null then raise exception '所属院が設定されていないため申請できません（社長に確認してください）'; end if;
  if p_user = v_me then
    if not mgmt.can('leave.request.self', v_store) and not mgmt.can('leave.request.self') then
      raise exception '休暇を申請する権限がありません' using errcode = '42501';
    end if;
  else
    -- 代理申請は院長が自院スタッフの有給だけ（振休は承認者も院長のため、代理すると自己承認になる）
    if p_kind <> 'PAID' then raise exception '振休は本人が申請してください'; end if;
    if not mgmt.can('leave.request.proxy', v_store) then raise exception 'この人の代理で申請する権限がありません' using errcode = '42501'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('leave:' || p_user::text, 0));
  select array_agg(x order by x) into v_dates from unnest(p_dates) x;
  v_short := mgmt.check_leave_dates(p_user, p_kind, v_dates, null);
  if v_short and (p_exception_note is null or length(btrim(p_exception_note)) < 2) then
    raise exception '残数が足りません。例外確認として申請する場合は、理由を入力してください';
  end if;
  insert into mgmt.leave_requests (user_id, store_id, kind, dates, total_days, reason, balance_shortage, exception_note, submitted_by)
  values (p_user, v_store, p_kind, v_dates, cardinality(v_dates), nullif(btrim(p_reason), ''), v_short,
          case when v_short then btrim(p_exception_note) end, v_me)
  returning id into v_id;
  perform mgmt.open_leave_step(v_id);
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot, idempotency_key)
  values ('leave', v_id, 'submit', v_me, mgmt.leave_snapshot(v_id), p_idempotency_key);
  perform mgmt.notify(p_user, 'leave_submitted', mgmt.kind_label(p_kind) || 'の申請を受け付けました', array_to_string(v_dates, '・'), '/leave/' || v_id, 'leave:' || v_id || ':submitted:1');
  return v_id;
end $$;

-- 承認：日付ごとに、期限の早い付与から割り当てる（同じトランザクション内）
create or replace function mgmt.allocate_leave(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r mgmt.leave_requests; d date; g record;
begin
  select * into r from mgmt.leave_requests where id = p_request;
  perform pg_advisory_xact_lock(hashtextextended('leave:' || r.user_id::text, 0));
  foreach d in array r.dates loop
    select s.grant_id, t.id as type_id into g
    from mgmt.leave_types t cross join lateral mgmt.leave_grant_state(r.user_id, t.id, d) s
    where t.id in (select mgmt.leave_type_ids_for(r.kind))
      and s.remaining >= 1 and s.grant_date <= d and (s.expires_on >= d or s.state = 'expired_alert')
    order by s.expires_on, s.grant_date limit 1;
    if g.grant_id is null then
      raise exception '%の時点で使える%が足りないため承認できません（残数の修正か日程の調整が必要です）', d, mgmt.kind_label(r.kind);
    end if;
    insert into mgmt.leave_usage (leave_request_id, leave_grant_id, user_id, leave_type_id, usage_date, days, status, counts_toward_5day, created_by)
    values (p_request, g.grant_id, r.user_id, g.type_id, d, 1, 'planned', r.kind = 'PAID', mgmt.current_user_id());
  end loop;
end $$;

-- 承認・差戻し・却下（全申請共通の入口。今は休暇のみ）
create or replace function mgmt.decide_leave_step(
  p_step uuid, p_action text, p_reason text default null, p_reason_category text default null,
  p_expected_version int default null, p_idempotency_key text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := mgmt.current_user_id();
  s mgmt.approval_steps; r mgmt.leave_requests;
  v_self boolean := false; v_name text; v_title text;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_action not in ('approve','return','reject') then raise exception '操作が正しくありません'; end if;
  if p_idempotency_key is not null and exists (select 1 from mgmt.approval_events where idempotency_key = p_idempotency_key) then
    return (select r2.status from mgmt.leave_requests r2 join mgmt.approval_events e on e.request_id = r2.id where e.idempotency_key = p_idempotency_key);
  end if;
  select * into s from mgmt.approval_steps where id = p_step for update;
  if s.id is null then raise exception '承認の依頼が見つかりません'; end if;
  select * into r from mgmt.leave_requests where id = s.leave_request_id for update;
  if s.status <> 'pending' or r.status <> 'pending' then raise exception 'この申請はすでに処理されています'; end if;
  if p_expected_version is not null and p_expected_version <> s.version then raise exception 'ほかの人が先に処理しました。画面を更新してください'; end if;

  -- 権限
  if s.step_kind = 'president_final' then
    if not mgmt.can('leave.paid.final_approve') then raise exception '有給を承認できるのは社長だけです' using errcode = '42501'; end if;
  elsif s.step_kind = 'manager_final' then
    if not exists (select 1 from mgmt.store_managers(s.approver_store_id) m where m = v_me) then
      raise exception '振休を承認できるのは、%の院長だけです', (select name from mgmt.stores where id = s.approver_store_id) using errcode = '42501';
    end if;
  end if;
  -- 自己承認の防止（例外：院長本人の振休は本人が承認できる＝Q-1）
  if v_me = r.user_id or v_me = r.submitted_by then
    if s.step_kind = 'manager_final' and v_me = r.user_id and v_me = r.submitted_by then
      v_self := true;
    else
      raise exception '自分の申請は承認できません' using errcode = '42501';
    end if;
  end if;
  if p_action in ('return','reject') and (p_reason is null or length(btrim(p_reason)) < 2) then
    raise exception '差戻し・却下の理由を入力してください';
  end if;
  if p_action = 'reject' and r.kind = 'PAID' and coalesce(p_reason_category, '') not in ('申請内容の不備','時季変更の申し入れ','その他') then
    raise exception '有給の却下は理由の区分（申請内容の不備／時季変更の申し入れ／その他）を選んでください';
  end if;

  if p_action = 'approve' then
    perform mgmt.allocate_leave(r.id);
    update mgmt.leave_requests set status = 'approved', decided_at = now(), updated_at = now(), version = version + 1 where id = r.id;
  else
    update mgmt.leave_requests set status = case p_action when 'return' then 'returned' else 'rejected' end,
      decided_at = now(), updated_at = now(), version = version + 1 where id = r.id;
  end if;
  update mgmt.approval_steps set status = case p_action when 'approve' then 'approved' when 'return' then 'returned' else 'rejected' end,
    decided_by = v_me, decided_at = now(), comment = nullif(btrim(p_reason), ''), self_approved = v_self, version = version + 1
  where id = s.id;
  insert into mgmt.approval_events (request_kind, request_id, step_id, action, actor_user_id, reason, reason_category, self_approved, snapshot, idempotency_key)
  values ('leave', r.id, s.id, p_action, v_me, nullif(btrim(p_reason), ''), p_reason_category, v_self, mgmt.leave_snapshot(r.id), p_idempotency_key);

  select name into v_name from mgmt.users where id = r.user_id;
  v_title := mgmt.kind_label(r.kind) || 'が' || case p_action when 'approve' then '承認' when 'return' then '差戻し' else '却下' end || 'されました';
  perform mgmt.notify(r.user_id, 'leave_decided', v_title, coalesce(nullif(btrim(p_reason), ''), array_to_string(r.dates, '・')), '/leave/' || r.id, 'approval:' || s.id || ':' || p_action);
  if r.submitted_by <> r.user_id then
    perform mgmt.notify(r.submitted_by, 'leave_decided', v_name || 'さんの' || v_title, nullif(btrim(p_reason), ''), '/leave/' || r.id, 'approval:' || s.id || ':' || p_action);
  end if;
  -- 院長本人の振休を本人が承認したときは、GM・社長に知らせる（事後確認）
  if v_self then
    perform mgmt.notify(x, 'self_approved', '院長本人の振休が本人承認されました：' || v_name || 'さん', array_to_string(r.dates, '・'), '/leave/' || r.id, 'approval:' || s.id || ':self_approved')
    from (select mgmt.users_with_global_role('GM') x union select mgmt.users_with_global_role('PRESIDENT')) w;
  end if;
  return case p_action when 'approve' then 'approved' when 'return' then 'returned' else 'rejected' end;
end $$;

-- 差戻し後の再申請（本人・代理申請した人）
create or replace function mgmt.resubmit_leave_request(p_request uuid, p_dates date[], p_reason text default null, p_exception_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.leave_requests; v_short boolean; v_dates date[];
begin
  select * into r from mgmt.leave_requests where id = p_request for update;
  if r.id is null or v_me not in (r.user_id, r.submitted_by) then raise exception '申請が見つかりません'; end if;
  if r.status <> 'returned' then raise exception '再申請できるのは差戻しされた申請だけです'; end if;
  perform pg_advisory_xact_lock(hashtextextended('leave:' || r.user_id::text, 0));
  select array_agg(x order by x) into v_dates from unnest(p_dates) x;
  v_short := mgmt.check_leave_dates(r.user_id, r.kind, v_dates, r.id);
  if v_short and (p_exception_note is null or length(btrim(p_exception_note)) < 2) then
    raise exception '残数が足りません。例外確認として申請する場合は、理由を入力してください';
  end if;
  update mgmt.leave_requests set dates = v_dates, total_days = cardinality(v_dates), reason = nullif(btrim(p_reason), ''),
    balance_shortage = v_short, exception_note = case when v_short then btrim(p_exception_note) end,
    status = 'pending', submit_count = submit_count + 1, decided_at = null, updated_at = now(), version = version + 1
  where id = r.id;
  perform mgmt.open_leave_step(r.id);
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('leave', r.id, 'resubmit', v_me, mgmt.leave_snapshot(r.id));
  return r.id;
end $$;

-- 取下げ（承認待ち・差戻し中のとき、本人・代理申請した人）
create or replace function mgmt.withdraw_leave_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.leave_requests;
begin
  select * into r from mgmt.leave_requests where id = p_request for update;
  if r.id is null or v_me not in (r.user_id, r.submitted_by) then raise exception '申請が見つかりません'; end if;
  if r.status not in ('pending','returned') then raise exception '取下げできるのは承認前の申請だけです'; end if;
  update mgmt.leave_requests set status = 'withdrawn', updated_at = now(), version = version + 1 where id = r.id;
  update mgmt.approval_steps set status = 'cancelled', version = version + 1 where leave_request_id = r.id and status in ('pending','waiting');
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('leave', r.id, 'withdraw', v_me, mgmt.leave_snapshot(r.id));
end $$;

-- 取消（承認済み）。取得前：本人・代理申請した人・承認できる人。取得済みを含む：社長（実績の訂正）。理由必須
create or replace function mgmt.cancel_leave_request(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.leave_requests; v_taken boolean; v_is_approver boolean;
begin
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '取消の理由を入力してください'; end if;
  select * into r from mgmt.leave_requests where id = p_request for update;
  if r.id is null then raise exception '申請が見つかりません'; end if;
  if r.status <> 'approved' then raise exception '取消できるのは承認済みの申請だけです'; end if;
  perform pg_advisory_xact_lock(hashtextextended('leave:' || r.user_id::text, 0));
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

-- 取得日を過ぎた予定を取得済みにする（日次ジョブ。サービスロールまたは社長）
create or replace function mgmt.confirm_leave_taken(p_as_of date default mgmt.jst_today()) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.role() is distinct from 'service_role' and not mgmt.can('leave.adjust') then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  update mgmt.leave_usage set status = 'taken', updated_at = now(), version = version + 1
  where status = 'planned' and usage_date < p_as_of;
  get diagnostics n = row_count;
  return n;
end $$;

-- 自分が判断できる承認待ち（社長＝有給、院長＝自院の振休）
create or replace function mgmt.my_approval_queue() returns table (
  step_id uuid, step_version int, request_id uuid, kind text, user_id uuid, user_name text, store_name text,
  dates date[], total_days numeric, reason text, balance_shortage boolean, exception_note text,
  submitted_by_name text, submitted_at timestamptz, self_approval boolean, available numeric, pending_other numeric
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.version, r.id, r.kind, r.user_id, u.name, st.name, r.dates, r.total_days, r.reason, r.balance_shortage, r.exception_note,
    sb.name, r.updated_at,
    (s.step_kind = 'manager_final' and r.user_id = mgmt.current_user_id()),
    mgmt.available_for(r.user_id, r.kind, (select max(x) from unnest(r.dates) x)),
    mgmt.pending_days(r.user_id, r.kind, r.id)
  from mgmt.approval_steps s
  join mgmt.leave_requests r on r.id = s.leave_request_id and r.status = 'pending'
  join mgmt.users u on u.id = r.user_id
  join mgmt.users sb on sb.id = r.submitted_by
  join mgmt.stores st on st.id = r.store_id
  where s.status = 'pending'
    and (
      (s.step_kind = 'president_final' and mgmt.can('leave.paid.final_approve') and r.user_id <> mgmt.current_user_id() and r.submitted_by <> mgmt.current_user_id())
      or (s.step_kind = 'manager_final' and exists (select 1 from mgmt.store_managers(s.approver_store_id) m where m = mgmt.current_user_id())
          and (r.submitted_by <> mgmt.current_user_id() or r.user_id = mgmt.current_user_id()))
    )
  order by (select min(x) from unnest(r.dates) x), r.created_at
$$;

-- 申請中の日数を残数に表示する（振休は「振替」の行にまとめて出す）
create or replace function mgmt.leave_balance(p_user uuid, p_type_code text, p_as_of date default mgmt.jst_today())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_type uuid;
  r jsonb;
begin
  if not mgmt.can_view_leave_of(p_user) then
    raise exception 'この人の休暇を見る権限がありません' using errcode = '42501';
  end if;
  select id into v_type from mgmt.leave_types where code = p_type_code;
  if v_type is null then raise exception '休暇の区分が正しくありません'; end if;
  with s as (select * from mgmt.leave_grant_state(p_user, v_type, p_as_of)),
  live as (select * from s where state in ('active','expired_alert'))
  select jsonb_build_object(
    'type', p_type_code,
    'as_of', p_as_of,
    'granted', coalesce((select sum(days) from live), 0),
    'adjusted', coalesce((select sum(adjusted) from live), 0),
    'taken', coalesce((select sum(taken) from live), 0),
    'planned', coalesce((select sum(planned) from live), 0),
    'pending', case p_type_code when 'PAID' then mgmt.pending_days(p_user, 'PAID') when 'SHIFT' then mgmt.pending_days(p_user, 'SHIFT') else 0 end,
    'current', coalesce((select sum(days + adjusted - taken) from live), 0),
    'after_planned', coalesce((select sum(remaining) from live), 0),
    'lapsed', coalesce((select sum(greatest(remaining, 0)) from s where state = 'expired_lapsed'), 0),
    'overdue', coalesce((select sum(greatest(remaining, 0)) from s where state = 'expired_alert'), 0),
    'overdue_since', (select min(expires_on) from s where state = 'expired_alert' and remaining > 0),
    'next_expiry_date', (select min(expires_on) from s where state = 'active' and remaining > 0),
    'next_expiry_days', coalesce((select sum(remaining) from s where state = 'active' and remaining > 0
                          and expires_on = (select min(expires_on) from s where state = 'active' and remaining > 0)), 0),
    'grants', coalesce((select jsonb_agg(to_jsonb(s.*) order by s.expires_on, s.grant_date) from s), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- 申請の承認予定者が見えるようにする（申請詳細の表示用）
create or replace function mgmt.can_view_leave_request(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from mgmt.leave_requests r where r.id = p_request and (
      r.user_id = mgmt.current_user_id() or r.submitted_by = mgmt.current_user_id() or mgmt.can_view_leave_of(r.user_id)
      or (r.kind = 'PAID' and mgmt.can('leave.paid.final_approve'))
    )
  )
$$;

-- ===== RLS =====
alter table mgmt.leave_requests enable row level security;
alter table mgmt.approval_steps enable row level security;
alter table mgmt.approval_events enable row level security;
alter table mgmt.notifications enable row level security;

create policy leave_requests_select on mgmt.leave_requests for select to authenticated using (mgmt.can_view_leave_request(id));
create policy approval_steps_select on mgmt.approval_steps for select to authenticated using (mgmt.can_view_leave_request(leave_request_id));
create policy approval_events_select on mgmt.approval_events for select to authenticated using (request_kind = 'leave' and mgmt.can_view_leave_request(request_id));
create policy notifications_select on mgmt.notifications for select to authenticated using (user_id = mgmt.current_user_id());
create policy notifications_read on mgmt.notifications for update to authenticated using (user_id = mgmt.current_user_id()) with check (user_id = mgmt.current_user_id());

grant select on mgmt.leave_requests, mgmt.approval_steps, mgmt.approval_events, mgmt.notifications to authenticated;
grant update (read_at) on mgmt.notifications to authenticated;
grant all on mgmt.leave_requests, mgmt.approval_steps, mgmt.approval_events, mgmt.notifications to service_role;
revoke all on mgmt.leave_requests, mgmt.approval_steps, mgmt.approval_events, mgmt.notifications from anon;

revoke execute on all functions in schema mgmt from public, anon;
grant execute on function
  mgmt.submit_leave_request(uuid, text, date[], text, text, text),
  mgmt.decide_leave_step(uuid, text, text, text, int, text),
  mgmt.resubmit_leave_request(uuid, date[], text, text),
  mgmt.withdraw_leave_request(uuid),
  mgmt.cancel_leave_request(uuid, text),
  mgmt.confirm_leave_taken(date),
  mgmt.my_approval_queue(),
  mgmt.leave_balance(uuid, text, date),
  mgmt.can_view_leave_request(uuid)
  to authenticated;
grant execute on all functions in schema mgmt to service_role;
