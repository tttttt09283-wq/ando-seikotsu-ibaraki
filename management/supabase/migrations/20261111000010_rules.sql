-- AND GROUP MANAGEMENT SYSTEM — PHASE 8：社内規定（制定・改定・社長承認・公開・既読確認）
-- 設計：docs/database.md §4.2、docs/workflows.md §5、requirements.md FR-RL
-- ・改定案は社長・GMが作る（2026-11-11 決定：GMにも改定案の作成を許可）
-- ・承認・公開は社長だけ。社長が自分で作った改定案は社長が承認できる（「本人承認」の印を残し、GMに通知）
-- ・状態：draft（下書き）→ pending_approval（承認待ち）→ approved（承認済み）→ published（公開中）→ superseded（旧版）
--   承認待ちから差戻すと下書きに戻る（理由必須）
-- ・初期規定 001〜005 は is_provisional = true（初期案）。会社の正式承認と労務確認が終わるまで「施行済み」と表示しない
-- ・既読・確認は版ごとに記録。新しい版が公開されたら、適用対象者全員に通知して確認をやり直してもらう

create table mgmt.company_rules (
  id uuid primary key default gen_random_uuid(),
  rule_no text not null unique check (rule_no ~ '^[0-9]{3}$'),
  title text not null check (length(btrim(title)) between 2 and 100),
  current_version_id uuid,                -- 公開中の版
  created_at timestamptz not null default now()
);

create table mgmt.company_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references mgmt.company_rules(id) on delete cascade,
  version_no int not null,
  title text not null check (length(btrim(title)) between 2 and 100),
  body text not null default '',
  applies_to jsonb not null default '{}'::jsonb,   -- {"roles": ["MANAGER",...], "employment_types": ["アルバイト",...]}（空＝全員）
  effective_date date,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','published','superseded','discarded')),
  is_provisional boolean not null default false,
  change_summary text,
  created_by uuid references mgmt.users(id),
  submitted_by uuid references mgmt.users(id),
  submitted_at timestamptz,
  approved_by uuid references mgmt.users(id),
  approved_at timestamptz,
  self_approved boolean not null default false,
  returned_reason text,
  published_by uuid references mgmt.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (rule_id, version_no)
);
-- 1つの規定に、作業中（下書き・承認待ち・承認済み）の版は1つだけ
create unique index company_rule_versions_one_working on mgmt.company_rule_versions (rule_id) where status in ('draft','pending_approval','approved');
alter table mgmt.company_rules add constraint company_rules_current_version_fk foreign key (current_version_id) references mgmt.company_rule_versions(id);
create trigger audit after insert or update or delete on mgmt.company_rule_versions for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.company_rules for each row execute function mgmt.audit_trigger();

create table mgmt.rule_acknowledgements (
  id bigint generated always as identity primary key,
  version_id uuid not null references mgmt.company_rule_versions(id) on delete cascade,
  user_id uuid not null references mgmt.users(id),
  acknowledged_at timestamptz not null default now(),
  unique (version_id, user_id)
);

-- 承認ステップ・履歴を規定にも使う
alter table mgmt.approval_steps add column rule_version_id uuid references mgmt.company_rule_versions(id) on delete cascade;
alter table mgmt.approval_steps drop constraint approval_steps_one_request;
alter table mgmt.approval_steps add constraint approval_steps_one_request
  check (num_nonnulls(leave_request_id, part_time_request_id, holiday_change_request_id, rule_version_id) = 1);
alter table mgmt.approval_events drop constraint approval_events_request_kind_check;
alter table mgmt.approval_events add constraint approval_events_request_kind_check check (request_kind in ('leave','part_time','holiday_change','rule'));
alter table mgmt.approval_events drop constraint approval_events_action_check;
alter table mgmt.approval_events add constraint approval_events_action_check
  check (action in ('submit','resubmit','approve','return','reject','withdraw','cancel','confirm_taken','assign_worker','create','publish'));

-- ===== 適用対象 =====
create or replace function mgmt.user_role_codes(p_user uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select r.code from mgmt.user_roles ur join mgmt.roles r on r.id = ur.role_id where ur.user_id = p_user and mgmt.is_current(ur.starts_on, ur.ends_on)
  union
  select r.code from mgmt.user_store_assignments a join mgmt.roles r on r.id = a.role_id where a.user_id = p_user and mgmt.is_current(a.starts_on, a.ends_on)
$$;
create or replace function mgmt.rule_applies_to(p_applies jsonb, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from mgmt.users u where u.id = p_user and u.status = 'active')
    and (coalesce(jsonb_array_length(p_applies -> 'roles'), 0) = 0
         or exists (select 1 from mgmt.user_role_codes(p_user) c where p_applies -> 'roles' ? c))
    and (coalesce(jsonb_array_length(p_applies -> 'employment_types'), 0) = 0
         or (p_applies -> 'employment_types') ? (select employment_type from mgmt.users where id = p_user))
$$;
-- 適用対象の形を確かめる（役職・雇用区分のコードだけ）
create or replace function mgmt.check_applies_to(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  p := coalesce(p, '{}'::jsonb);
  if jsonb_typeof(p) <> 'object' or exists (select 1 from jsonb_object_keys(p) k where k not in ('roles','employment_types')) then
    raise exception '適用対象の形式が正しくありません';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'roles', '[]')) x where x not in (select code from mgmt.roles)) then
    raise exception '適用対象の役職が正しくありません';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'employment_types', '[]')) x where x not in ('役員','正社員','短時間正社員','アルバイト')) then
    raise exception '適用対象の雇用区分が正しくありません';
  end if;
  return p;
end $$;

-- 見る：公開中・旧版は規定を読める人（全員）。作業中の版は改定案を作れる人・承認できる人だけ
create or replace function mgmt.can_view_rule_version(p_version uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from mgmt.company_rule_versions v where v.id = p_version and (
    (v.status in ('published','superseded') and mgmt.can_anywhere('rule.view'))
    or mgmt.can('rule.edit') or mgmt.can('rule.approve')))
$$;

create or replace function mgmt.rule_snapshot(p_version uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('rule_no', r.rule_no, 'version_no', v.version_no, 'title', v.title, 'status', v.status,
    'effective_date', v.effective_date, 'is_provisional', v.is_provisional, 'change_summary', v.change_summary, 'body_md5', md5(v.body))
  from mgmt.company_rule_versions v join mgmt.company_rules r on r.id = v.rule_id where v.id = p_version
$$;

-- ===== 一覧・詳細 =====
create or replace function mgmt.list_rules() returns table (
  rule_id uuid, rule_no text, title text,
  current_version_id uuid, current_version_no int, effective_date date, is_provisional boolean, published_at timestamptz,
  applies_to_me boolean, acknowledged_at timestamptz,
  working_version_id uuid, working_status text, working_version_no int,
  target_count int, ack_count int
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rule_no, coalesce(c.title, r.title), c.id, c.version_no, c.effective_date, c.is_provisional, c.published_at,
    case when c.id is null then false else mgmt.rule_applies_to(c.applies_to, mgmt.current_user_id()) end,
    (select a.acknowledged_at from mgmt.rule_acknowledgements a where a.version_id = c.id and a.user_id = mgmt.current_user_id()),
    w.id, w.status, w.version_no,
    case when c.id is not null and (mgmt.can('rule.edit') or mgmt.can('rule.approve') or mgmt.can('staff.view.all'))
      then (select count(*)::int from mgmt.users u where mgmt.rule_applies_to(c.applies_to, u.id)) end,
    case when c.id is not null and (mgmt.can('rule.edit') or mgmt.can('rule.approve') or mgmt.can('staff.view.all'))
      then (select count(*)::int from mgmt.rule_acknowledgements a join mgmt.users u on u.id = a.user_id
            where a.version_id = c.id and mgmt.rule_applies_to(c.applies_to, u.id)) end
  from mgmt.company_rules r
  left join mgmt.company_rule_versions c on c.id = r.current_version_id
  left join mgmt.company_rule_versions w on w.rule_id = r.id and w.status in ('draft','pending_approval','approved') and (mgmt.can('rule.edit') or mgmt.can('rule.approve'))
  where mgmt.can_anywhere('rule.view') and (c.id is not null or w.id is not null)
  order by r.rule_no
$$;

create or replace function mgmt.get_rule(p_no text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r mgmt.company_rules; v_editor boolean := mgmt.can('rule.edit') or mgmt.can('rule.approve'); v jsonb;
begin
  select * into r from mgmt.company_rules where rule_no = p_no;
  if r.id is null or not mgmt.can_anywhere('rule.view') then return null; end if;
  if r.current_version_id is null and not (v_editor and exists (select 1 from mgmt.company_rule_versions where rule_id = r.id and status in ('draft','pending_approval','approved'))) then return null; end if;
  select jsonb_build_object(
    'rule_id', r.id, 'rule_no', r.rule_no, 'title', r.title, 'can_edit', mgmt.can('rule.edit'), 'can_approve', mgmt.can('rule.approve'),
    'current', (select to_jsonb(x) from (select v.id, v.version_no, v.title, v.body, v.applies_to, v.effective_date, v.is_provisional, v.change_summary,
                  v.published_at, v.self_approved, (select name from mgmt.users where id = v.approved_by) approved_by_name, v.approved_at,
                  mgmt.rule_applies_to(v.applies_to, mgmt.current_user_id()) applies_to_me,
                  (select a.acknowledged_at from mgmt.rule_acknowledgements a where a.version_id = v.id and a.user_id = mgmt.current_user_id()) acknowledged_at
                from mgmt.company_rule_versions v where v.id = r.current_version_id) x),
    'working', case when v_editor then (select to_jsonb(x) from (select v.id, v.version_no, v.title, v.body, v.applies_to, v.effective_date, v.is_provisional,
                  v.change_summary, v.status, v.returned_reason, v.version, v.created_by = mgmt.current_user_id() mine,
                  (select name from mgmt.users where id = v.created_by) created_by_name, v.submitted_at,
                  (select s.id from mgmt.approval_steps s where s.rule_version_id = v.id and s.status = 'pending') step_id,
                  (select s.version from mgmt.approval_steps s where s.rule_version_id = v.id and s.status = 'pending') step_version
                from mgmt.company_rule_versions v where v.rule_id = r.id and v.status in ('draft','pending_approval','approved')) x) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'version_no', v.version_no, 'status', v.status, 'effective_date', v.effective_date,
                  'published_at', v.published_at, 'change_summary', v.change_summary, 'is_provisional', v.is_provisional, 'self_approved', v.self_approved,
                  'approved_by_name', (select name from mgmt.users where id = v.approved_by)) order by v.version_no desc)
                from mgmt.company_rule_versions v where v.rule_id = r.id and v.status in ('published','superseded')), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- 旧版の本文（改定履歴から読む）
create or replace function mgmt.get_rule_version(p_version uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', v.id, 'rule_no', r.rule_no, 'version_no', v.version_no, 'title', v.title, 'body', v.body, 'status', v.status,
    'effective_date', v.effective_date, 'is_provisional', v.is_provisional, 'change_summary', v.change_summary, 'published_at', v.published_at)
  from mgmt.company_rule_versions v join mgmt.company_rules r on r.id = v.rule_id
  where v.id = p_version and mgmt.can_view_rule_version(v.id)
$$;

-- ===== 制定・改定 =====
create or replace function mgmt.create_rule(p_no text, p_title text, p_body text, p_applies jsonb, p_effective date, p_provisional boolean, p_summary text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v_rule uuid; v_ver uuid;
begin
  if v_me is null or not mgmt.can('rule.edit') then raise exception '規定を作れるのは社長・GMです' using errcode = '42501'; end if;
  if p_no is null or p_no !~ '^[0-9]{3}$' then raise exception '規定番号は3けたの数字です（例：006）'; end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception '規定名を入力してください'; end if;
  select id into v_rule from mgmt.company_rules where rule_no = p_no for update;
  if v_rule is not null then
    -- 公開したことがなく、作業中の版もない（破棄済み）の番号は使い直せる
    if exists (select 1 from mgmt.company_rules where id = v_rule and current_version_id is not null)
       or exists (select 1 from mgmt.company_rule_versions where rule_id = v_rule and status in ('draft','pending_approval','approved')) then
      raise exception '規定番号 % はすでにあります', p_no;
    end if;
    update mgmt.company_rules set title = btrim(p_title) where id = v_rule;
  else
    insert into mgmt.company_rules (rule_no, title) values (p_no, btrim(p_title)) returning id into v_rule;
  end if;
  insert into mgmt.company_rule_versions (rule_id, version_no, title, body, applies_to, effective_date, is_provisional, change_summary, created_by)
  values (v_rule, (select coalesce(max(version_no), 0) + 1 from mgmt.company_rule_versions where rule_id = v_rule), btrim(p_title), coalesce(p_body, ''), mgmt.check_applies_to(p_applies), p_effective, coalesce(p_provisional, false), coalesce(nullif(btrim(p_summary), ''), '制定'), v_me)
  returning id into v_ver;
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('rule', v_ver, 'create', v_me, mgmt.rule_snapshot(v_ver));
  return v_ver;
end $$;

-- 改定案を作る（公開中の版を写して下書きにする）
create or replace function mgmt.create_rule_draft(p_rule uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); r mgmt.company_rules; c mgmt.company_rule_versions; v_ver uuid;
begin
  if v_me is null or not mgmt.can('rule.edit') then raise exception '改定案を作れるのは社長・GMです' using errcode = '42501'; end if;
  select * into r from mgmt.company_rules where id = p_rule for update;
  if r.id is null then raise exception '規定が見つかりません'; end if;
  if exists (select 1 from mgmt.company_rule_versions where rule_id = p_rule and status in ('draft','pending_approval','approved')) then
    raise exception 'この規定にはすでに作業中の改定案があります';
  end if;
  select * into c from mgmt.company_rule_versions where id = r.current_version_id;
  insert into mgmt.company_rule_versions (rule_id, version_no, title, body, applies_to, effective_date, is_provisional, change_summary, created_by)
  values (p_rule, (select coalesce(max(version_no), 0) + 1 from mgmt.company_rule_versions where rule_id = p_rule),
    coalesce(c.title, r.title), coalesce(c.body, ''), coalesce(c.applies_to, '{}'::jsonb), null, coalesce(c.is_provisional, false), null, v_me)
  returning id into v_ver;
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('rule', v_ver, 'create', v_me, mgmt.rule_snapshot(v_ver));
  return v_ver;
end $$;

create or replace function mgmt.update_rule_draft(p_version uuid, p_title text, p_body text, p_applies jsonb, p_effective date, p_provisional boolean, p_summary text, p_expected_version int default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v mgmt.company_rule_versions;
begin
  if v_me is null or not mgmt.can('rule.edit') then raise exception '改定案を編集できるのは社長・GMです' using errcode = '42501'; end if;
  select * into v from mgmt.company_rule_versions where id = p_version for update;
  if v.id is null then raise exception '改定案が見つかりません'; end if;
  if v.status <> 'draft' then raise exception '編集できるのは下書きだけです（承認待ちの案は、取り下げてから編集してください）'; end if;
  if p_expected_version is not null and p_expected_version <> v.version then raise exception 'ほかの人が先に保存しました。画面を更新してください'; end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception '規定名を入力してください'; end if;
  update mgmt.company_rule_versions set title = btrim(p_title), body = coalesce(p_body, ''), applies_to = mgmt.check_applies_to(p_applies),
    effective_date = p_effective, is_provisional = coalesce(p_provisional, false), change_summary = nullif(btrim(coalesce(p_summary, '')), ''),
    updated_at = now(), version = version + 1
  where id = p_version;
end $$;

-- 下書きの破棄（履歴を残すため、行は消さずに「破棄」にする）
create or replace function mgmt.delete_rule_draft(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v mgmt.company_rule_versions;
begin
  if v_me is null or not mgmt.can('rule.edit') then raise exception '改定案を削除できるのは社長・GMです' using errcode = '42501'; end if;
  select * into v from mgmt.company_rule_versions where id = p_version for update;
  if v.id is null or v.status <> 'draft' then raise exception '削除できるのは下書きだけです'; end if;
  update mgmt.company_rule_versions set status = 'discarded', updated_at = now(), version = version + 1 where id = p_version;
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('rule', p_version, 'cancel', v_me, mgmt.rule_snapshot(p_version));
end $$;

-- 承認依頼（下書き → 承認待ち）
create or replace function mgmt.submit_rule_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v mgmt.company_rule_versions; v_step uuid; v_no text;
begin
  if v_me is null or not mgmt.can('rule.edit') then raise exception '承認を依頼できるのは社長・GMです' using errcode = '42501'; end if;
  select * into v from mgmt.company_rule_versions where id = p_version for update;
  if v.id is null or v.status <> 'draft' then raise exception '承認を依頼できるのは下書きだけです'; end if;
  if length(btrim(v.body)) < 10 then raise exception '本文を入力してください'; end if;
  if v.effective_date is null then raise exception '施行日を入力してください'; end if;
  if v.version_no > 1 and (v.change_summary is null or length(btrim(v.change_summary)) < 2) then raise exception '改定内容（何を変えたか）を入力してください'; end if;
  update mgmt.company_rule_versions set status = 'pending_approval', submitted_by = v_me, submitted_at = now(), returned_reason = null,
    updated_at = now(), version = version + 1 where id = p_version;
  insert into mgmt.approval_steps (rule_version_id, step_no, step_kind, status)
  values (p_version, (select coalesce(max(step_no), 0) + 1 from mgmt.approval_steps where rule_version_id = p_version), 'president_final', 'pending')
  returning id into v_step;
  insert into mgmt.approval_events (request_kind, request_id, step_id, action, actor_user_id, snapshot)
  values ('rule', p_version, v_step, 'submit', v_me, mgmt.rule_snapshot(p_version));
  select rule_no into v_no from mgmt.company_rules where id = v.rule_id;
  perform mgmt.notify(x, 'approval_request', '社内規定の承認依頼：' || v_no || ' ' || v.title || '（第' || v.version_no || '版）',
    coalesce(v.change_summary, '制定'), '/rules/' || v_no || '/edit', 'approval:' || v_step || ':requested')
  from mgmt.users_with_global_role('PRESIDENT') x where x <> v_me;
end $$;

-- 取下げ（承認待ち → 下書き。作った人か社長・GM）
create or replace function mgmt.withdraw_rule_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v mgmt.company_rule_versions;
begin
  if v_me is null or not mgmt.can('rule.edit') then raise exception '取り下げられるのは社長・GMです' using errcode = '42501'; end if;
  select * into v from mgmt.company_rule_versions where id = p_version for update;
  if v.id is null or v.status not in ('pending_approval','approved') then raise exception '取り下げられるのは承認待ち・承認済み（公開前）の案だけです'; end if;
  update mgmt.company_rule_versions set status = 'draft', approved_by = null, approved_at = null, self_approved = false, updated_at = now(), version = version + 1 where id = p_version;
  update mgmt.approval_steps set status = 'cancelled', version = version + 1 where rule_version_id = p_version and status = 'pending';
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('rule', p_version, 'withdraw', v_me, mgmt.rule_snapshot(p_version));
end $$;

-- 承認・差戻し（社長）
create or replace function mgmt.decide_rule_step(p_step uuid, p_action text, p_reason text default null, p_expected_version int default null, p_idempotency_key text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); s mgmt.approval_steps; v mgmt.company_rule_versions; v_self boolean; v_no text;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_action not in ('approve','return') then raise exception '操作が正しくありません'; end if;
  if p_idempotency_key is not null and exists (select 1 from mgmt.approval_events where idempotency_key = p_idempotency_key) then
    return (select v2.status from mgmt.company_rule_versions v2 join mgmt.approval_events e on e.request_id = v2.id where e.idempotency_key = p_idempotency_key);
  end if;
  select * into s from mgmt.approval_steps where id = p_step for update;
  if s.id is null or s.rule_version_id is null then raise exception '承認の依頼が見つかりません'; end if;
  if not mgmt.can('rule.approve') then raise exception '規定の承認ができるのは社長だけです' using errcode = '42501'; end if;
  select * into v from mgmt.company_rule_versions where id = s.rule_version_id for update;
  if s.status <> 'pending' or v.status <> 'pending_approval' then raise exception 'この改定案はすでに処理されています'; end if;
  if p_expected_version is not null and p_expected_version <> s.version then raise exception 'ほかの人が先に処理しました。画面を更新してください'; end if;
  if p_action = 'return' and (p_reason is null or length(btrim(p_reason)) < 2) then raise exception '差戻しの理由を入力してください'; end if;
  v_self := coalesce(v.created_by = v_me, false) or coalesce(v.submitted_by = v_me, false);
  select rule_no into v_no from mgmt.company_rules where id = v.rule_id;
  update mgmt.approval_steps set status = case p_action when 'approve' then 'approved' else 'returned' end, decided_by = v_me, decided_at = now(),
    comment = nullif(btrim(p_reason), ''), self_approved = (p_action = 'approve' and v_self), version = version + 1 where id = s.id;
  if p_action = 'approve' then
    update mgmt.company_rule_versions set status = 'approved', approved_by = v_me, approved_at = now(), self_approved = v_self, updated_at = now(), version = version + 1 where id = v.id;
    -- 社長が自分で作った改定案の承認（本人承認）は、GMに通知する
    if v_self then
      perform mgmt.notify(x, 'rule_self_approved', '社長が自身の改定案を承認しました（本人承認）：' || v_no || ' ' || v.title,
        coalesce(v.change_summary, '制定'), '/rules/' || v_no, 'rule:' || v.id || ':self_approved')
      from mgmt.users_with_global_role('GM') x;
    end if;
    if v.created_by is not null and v.created_by <> v_me then
      perform mgmt.notify(v.created_by, 'rule_decided', '改定案が承認されました：' || v_no || ' ' || v.title, '公開されるまで、スタッフには表示されません', '/rules/' || v_no || '/edit', 'approval:' || s.id || ':approve');
    end if;
  else
    update mgmt.company_rule_versions set status = 'draft', returned_reason = btrim(p_reason), updated_at = now(), version = version + 1 where id = v.id;
    perform mgmt.notify(v.created_by, 'rule_decided', '改定案が差戻されました：' || v_no || ' ' || v.title, btrim(p_reason), '/rules/' || v_no || '/edit', 'approval:' || s.id || ':return')
    where v.created_by is distinct from v_me;
  end if;
  insert into mgmt.approval_events (request_kind, request_id, step_id, action, actor_user_id, reason, self_approved, snapshot, idempotency_key)
  values ('rule', v.id, s.id, p_action, v_me, nullif(btrim(p_reason), ''), p_action = 'approve' and v_self, mgmt.rule_snapshot(v.id), p_idempotency_key);
  return case p_action when 'approve' then 'approved' else 'draft' end;
end $$;

-- 公開（社長）。前の版は旧版になり、適用対象者全員に通知（確認のやり直し）
create or replace function mgmt.publish_rule_version(p_version uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v mgmt.company_rule_versions; v_no text; v_n int;
begin
  if v_me is null or not mgmt.can('rule.approve') then raise exception '規定を公開できるのは社長だけです' using errcode = '42501'; end if;
  select * into v from mgmt.company_rule_versions where id = p_version for update;
  if v.id is null or v.status <> 'approved' then raise exception '公開できるのは社長が承認した改定案だけです'; end if;
  perform 1 from mgmt.company_rules where id = v.rule_id for update;
  update mgmt.company_rule_versions set status = 'superseded', updated_at = now(), version = version + 1 where rule_id = v.rule_id and status = 'published';
  update mgmt.company_rule_versions set status = 'published', published_by = v_me, published_at = now(), updated_at = now(), version = version + 1 where id = p_version;
  update mgmt.company_rules set current_version_id = p_version, title = v.title where id = v.rule_id returning rule_no into v_no;
  insert into mgmt.approval_events (request_kind, request_id, action, actor_user_id, snapshot) values ('rule', p_version, 'publish', v_me, mgmt.rule_snapshot(p_version));
  with ins as (
    insert into mgmt.notifications (user_id, kind, title, body, link, event_key)
    select u.id, 'rule_published',
      case when v.version_no = 1 then '社内規定が公開されました：' else '社内規定が改定されました：' end || v_no || ' ' || v.title,
      case when v.is_provisional then '【初期案・労務確認中】' else '' end || coalesce(v.change_summary, '') || '　内容を読んで「確認しました」を押してください',
      '/rules/' || v_no, 'rule:' || p_version || ':published'
    from mgmt.users u where mgmt.rule_applies_to(v.applies_to, u.id)
    on conflict (user_id, event_key) do nothing returning 1
  ) select count(*) into v_n from ins;
  return v_n;
end $$;

-- 既読・確認（公開中の版だけ。適用対象の人）
create or replace function mgmt.acknowledge_rule(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v mgmt.company_rule_versions;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  select * into v from mgmt.company_rule_versions where id = p_version;
  if v.id is null or v.status <> 'published' then raise exception '確認できるのは公開中の規定だけです（新しい版が公開されていれば、そちらを確認してください）'; end if;
  if not mgmt.rule_applies_to(v.applies_to, v_me) then raise exception 'この規定はあなたの確認の対象ではありません'; end if;
  insert into mgmt.rule_acknowledgements (version_id, user_id) values (p_version, v_me) on conflict do nothing;
end $$;

-- 自分の未確認の規定
create or replace function mgmt.my_unacknowledged_rules() returns table (rule_no text, title text, version_id uuid, version_no int, published_at timestamptz, is_provisional boolean)
language sql stable security definer set search_path = '' as $$
  select r.rule_no, v.title, v.id, v.version_no, v.published_at, v.is_provisional
  from mgmt.company_rules r join mgmt.company_rule_versions v on v.id = r.current_version_id
  where mgmt.rule_applies_to(v.applies_to, mgmt.current_user_id())
    and not exists (select 1 from mgmt.rule_acknowledgements a where a.version_id = v.id and a.user_id = mgmt.current_user_id())
  order by r.rule_no
$$;

-- 確認の状況（社長・GM）
create or replace function mgmt.rule_ack_status(p_version uuid) returns table (user_id uuid, name text, store_name text, acknowledged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.name, (select s.name from mgmt.stores s where s.id = mgmt.primary_store_of(u.id)), a.acknowledged_at
  from mgmt.company_rule_versions v
  join mgmt.users u on mgmt.rule_applies_to(v.applies_to, u.id)
  left join mgmt.rule_acknowledgements a on a.version_id = v.id and a.user_id = u.id
  where v.id = p_version and (mgmt.can('rule.edit') or mgmt.can('rule.approve') or mgmt.can('staff.view.all'))
  order by a.acknowledged_at is not null, 3 nulls last, u.name
$$;

-- 社長の承認待ち（規定）
create or replace function mgmt.my_rule_queue() returns table (step_id uuid, step_version int, version_id uuid, rule_no text, title text, version_no int,
  change_summary text, effective_date date, is_provisional boolean, submitted_by_name text, submitted_at timestamptz, self_authored boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.version, v.id, r.rule_no, v.title, v.version_no, v.change_summary, v.effective_date, v.is_provisional,
    (select name from mgmt.users where id = v.submitted_by), v.submitted_at,
    coalesce(v.created_by = mgmt.current_user_id(), false) or coalesce(v.submitted_by = mgmt.current_user_id(), false)
  from mgmt.approval_steps s join mgmt.company_rule_versions v on v.id = s.rule_version_id join mgmt.company_rules r on r.id = v.rule_id
  where s.status = 'pending' and v.status = 'pending_approval' and mgmt.can('rule.approve')
  order by v.submitted_at
$$;

-- 履歴（名前つき）に規定を追加
create or replace function mgmt.request_history(p_kind text, p_request uuid)
returns table (id bigint, action text, reason text, reason_category text, self_approved boolean, occurred_at timestamptz, actor_name text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.action, e.reason, e.reason_category, e.self_approved, e.occurred_at, u.name
  from mgmt.approval_events e
  left join mgmt.users u on u.id = e.actor_user_id
  where e.request_kind = p_kind and e.request_id = p_request
    and case p_kind when 'leave' then mgmt.can_view_leave_request(p_request)
                    when 'part_time' then mgmt.can_view_part_time(p_request)
                    when 'holiday_change' then mgmt.can_view_holiday_change(p_request)
                    when 'rule' then mgmt.can('rule.edit') or mgmt.can('rule.approve') else false end
  order by e.id
$$;

-- ===== RLS・権限 =====
alter table mgmt.company_rules enable row level security;
alter table mgmt.company_rule_versions enable row level security;
alter table mgmt.rule_acknowledgements enable row level security;
-- 直接の読み書きはさせない（すべて関数を通す）
revoke all on mgmt.company_rules, mgmt.company_rule_versions, mgmt.rule_acknowledgements from anon, authenticated;
grant all on mgmt.company_rules, mgmt.company_rule_versions, mgmt.rule_acknowledgements to service_role;
drop policy approval_steps_select on mgmt.approval_steps;
create policy approval_steps_select on mgmt.approval_steps for select to authenticated using (
  (leave_request_id is not null and mgmt.can_view_leave_request(leave_request_id))
  or (part_time_request_id is not null and mgmt.can_view_part_time(part_time_request_id))
  or (holiday_change_request_id is not null and mgmt.can_view_holiday_change(holiday_change_request_id))
  or (rule_version_id is not null and (mgmt.can('rule.edit') or mgmt.can('rule.approve')))
);
drop policy approval_events_select on mgmt.approval_events;
create policy approval_events_select on mgmt.approval_events for select to authenticated using (
  (request_kind = 'leave' and mgmt.can_view_leave_request(request_id))
  or (request_kind = 'part_time' and mgmt.can_view_part_time(request_id))
  or (request_kind = 'holiday_change' and mgmt.can_view_holiday_change(request_id))
  or (request_kind = 'rule' and (mgmt.can('rule.edit') or mgmt.can('rule.approve')))
);

revoke execute on all functions in schema mgmt from public, anon;
grant execute on function
  mgmt.rule_applies_to(jsonb, uuid), mgmt.can_view_rule_version(uuid),
  mgmt.list_rules(), mgmt.get_rule(text), mgmt.get_rule_version(uuid),
  mgmt.create_rule(text, text, text, jsonb, date, boolean, text), mgmt.create_rule_draft(uuid),
  mgmt.update_rule_draft(uuid, text, text, jsonb, date, boolean, text, int), mgmt.delete_rule_draft(uuid),
  mgmt.submit_rule_version(uuid), mgmt.withdraw_rule_version(uuid), mgmt.decide_rule_step(uuid, text, text, int, text),
  mgmt.publish_rule_version(uuid), mgmt.acknowledge_rule(uuid), mgmt.my_unacknowledged_rules(), mgmt.rule_ack_status(uuid),
  mgmt.my_rule_queue(), mgmt.request_history(text, uuid)
  to authenticated;
grant execute on all functions in schema mgmt to service_role;
