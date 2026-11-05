-- AND GROUP MANAGEMENT SYSTEM — PHASE 2：組織・権限・監査ログ
--
-- ・既存の Supabase プロジェクトに専用スキーマ mgmt を作る（既存POSの public とは分ける）
-- ・anon（公開ページに埋め込まれた鍵）には一切の権限を与えない。authenticated のみ・RLS 必須
-- ・権限は「役職→権限（role_permissions）」×「店舗スコープ」で判定する（mgmt.can）
-- 設計：docs/database.md §4.1・docs/permissions.md

create schema if not exists mgmt;
create extension if not exists btree_gist with schema extensions;

revoke all on schema mgmt from public;
revoke all on schema mgmt from anon;
grant usage on schema mgmt to authenticated, service_role;

-- 日本時間の今日
create or replace function mgmt.jst_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Tokyo')::date
$$;

-- updated_at・version を自動で進める
create or replace function mgmt.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := coalesce(old.version, 0) + 1;
  return new;
end $$;

-- ===== マスタ =====
create table mgmt.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 40),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);

create table mgmt.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name text not null unique check (length(btrim(name)) between 1 and 40),
  area_id uuid references mgmt.areas(id),
  display_order int not null default 0,
  is_active boolean not null default true,
  opened_on date,
  pos_store_id int unique,            -- 既存POSの public.stores.id（POSに登録のある院だけ）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);

create table mgmt.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('PRESIDENT','GM','BM','MANAGER','STAFF','PART_TIMER')),
  name text not null,
  scope text not null check (scope in ('global','area','store')),
  rank int not null
);

create table mgmt.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+(\.[a-z_0-9]+)+$'),
  description text not null
);

create table mgmt.role_permissions (
  role_id uuid not null references mgmt.roles(id) on delete cascade,
  permission_id uuid not null references mgmt.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ===== ユーザー =====
create table mgmt.users (
  id uuid primary key references auth.users(id) on delete restrict,  -- POSと共通のログイン
  staff_code text not null unique check (staff_code ~ '^[A-Za-z0-9_-]{1,20}$'),
  login_id text not null unique check (login_id ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  name text not null check (length(btrim(name)) between 1 and 40),
  name_kana text check (name_kana is null or length(name_kana) <= 60),
  employment_type text not null default '正社員' check (employment_type in ('役員','正社員','短時間正社員','アルバイト')),
  hire_date date,
  weekly_work_days numeric(3,1) check (weekly_work_days is null or weekly_work_days between 0 and 7),
  weekly_work_hours numeric(4,1) check (weekly_work_hours is null or weekly_work_hours between 0 and 80),
  status text not null default 'active' check (status in ('active','suspended','retired')),
  retired_at date,
  pos_staff_id int unique,            -- 既存POSの public.clinic_staff.id
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  version int not null default 1,
  check ((status = 'retired') = (retired_at is not null))
);

-- 店舗への所属（院ごとの役職。複数店舗所属に対応、異動の履歴を残す）
create table mgmt.user_store_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mgmt.users(id),
  store_id uuid not null references mgmt.stores(id),
  role_id uuid not null references mgmt.roles(id),
  is_primary boolean not null default false,
  starts_on date not null default mgmt.jst_today(),
  ends_on date,
  created_at timestamptz not null default now(),
  created_by uuid,
  check (ends_on is null or ends_on >= starts_on),
  exclude using gist (
    user_id with =, store_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);
create index on mgmt.user_store_assignments (user_id) where ends_on is null;
create index on mgmt.user_store_assignments (store_id) where ends_on is null;

-- 全社・エリアの役職（社長・GM・BM）
create table mgmt.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mgmt.users(id),
  role_id uuid not null references mgmt.roles(id),
  area_id uuid references mgmt.areas(id),
  starts_on date not null default mgmt.jst_today(),
  ends_on date,
  created_at timestamptz not null default now(),
  created_by uuid,
  check (ends_on is null or ends_on >= starts_on)
);
create index on mgmt.user_roles (user_id) where ends_on is null;

-- 役職の種類と表の組み合わせを確認（店舗の役職は所属へ、社長・GM・BMは user_roles へ）
create or replace function mgmt.check_role_scope() returns trigger
language plpgsql set search_path = '' as $$
declare s text;
begin
  select scope into s from mgmt.roles where id = new.role_id;
  if tg_table_name = 'user_store_assignments' and s <> 'store' then
    raise exception '店舗の所属には、院長・一般スタッフ・アルバイトの役職だけを設定できます';
  end if;
  if tg_table_name = 'user_roles' then
    if s = 'store' then raise exception '院長・スタッフの役職は店舗の所属で設定してください'; end if;
    if s = 'area' and new.area_id is null then raise exception 'BMには担当エリアが必要です'; end if;
    if s = 'global' and new.area_id is not null then raise exception '社長・GMにエリアは設定しません'; end if;
  end if;
  return new;
end $$;
create trigger check_role_scope before insert or update on mgmt.user_store_assignments
  for each row execute function mgmt.check_role_scope();
create trigger check_role_scope before insert or update on mgmt.user_roles
  for each row execute function mgmt.check_role_scope();

-- 主所属は1人1つまで（有効な所属のうち）
create unique index user_primary_assignment on mgmt.user_store_assignments (user_id)
  where is_primary and ends_on is null;

create trigger touch before update on mgmt.areas for each row execute function mgmt.touch_row();
create trigger touch before update on mgmt.stores for each row execute function mgmt.touch_row();
create trigger touch before update on mgmt.users for each row execute function mgmt.touch_row();

-- ===== 監査ログ（追記のみ） =====
create table mgmt.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb,
  reason text,
  occurred_at timestamptz not null default now()
);
create index on mgmt.audit_logs (table_name, record_id);
create index on mgmt.audit_logs (occurred_at desc);

create or replace function mgmt.audit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into mgmt.audit_logs (actor_user_id, action, table_name, record_id, before, after)
  values (
    auth.uid(), tg_op, tg_table_name, rec ->> 'id',
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

create trigger audit after insert or update or delete on mgmt.areas for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.stores for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.users for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.user_store_assignments for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.user_roles for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.role_permissions for each row execute function mgmt.audit_trigger();

-- 監査ログは誰も変更・削除できない（社長・サービスロールも）
create or replace function mgmt.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '監査ログは変更・削除できません';
end $$;
create trigger forbid_change before update or delete on mgmt.audit_logs
  for each row execute function mgmt.forbid_change();

-- 有効な社長が0人になる変更を止める（社長がいなくなると最終承認ができないため）
create or replace function mgmt.keep_one_president() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from mgmt.user_roles ur
    join mgmt.roles r on r.id = ur.role_id and r.code = 'PRESIDENT'
    join mgmt.users u on u.id = ur.user_id and u.status = 'active'
    where ur.starts_on <= mgmt.jst_today() and (ur.ends_on is null or ur.ends_on >= mgmt.jst_today())
  ) and exists (select 1 from mgmt.user_roles ur join mgmt.roles r on r.id = ur.role_id and r.code = 'PRESIDENT') then
    raise exception '有効な社長が1人もいなくなる変更はできません';
  end if;
  return null;
end $$;
create constraint trigger keep_one_president after update or delete on mgmt.user_roles
  deferrable initially deferred for each row execute function mgmt.keep_one_president();
create constraint trigger keep_one_president after update on mgmt.users
  deferrable initially deferred for each row execute function mgmt.keep_one_president();

-- ===== 権限の判定（RLS と画面・サーバー処理で共通に使う） =====
-- 有効な期間か
create or replace function mgmt.is_current(starts date, ends date) returns boolean
language sql stable set search_path = '' as $$
  select starts <= mgmt.jst_today() and (ends is null or ends >= mgmt.jst_today())
$$;

-- ログイン中の有効なユーザー（退職・停止中は NULL）
create or replace function mgmt.current_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from mgmt.users u where u.id = auth.uid() and u.status = 'active'
$$;

-- 自分の全社・エリアの役職
create or replace function mgmt.my_global_role_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select ur.role_id from mgmt.user_roles ur
  join mgmt.roles r on r.id = ur.role_id and r.scope = 'global'
  where ur.user_id = mgmt.current_user_id() and mgmt.is_current(ur.starts_on, ur.ends_on)
$$;

-- その店舗で効いている自分の役職（全社の役職＋担当エリアのBM＋その店舗の所属）
create or replace function mgmt.my_role_ids_for_store(p_store uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select role_id from mgmt.my_global_role_ids() as role_id
  union
  select ur.role_id from mgmt.user_roles ur
    join mgmt.stores s on s.area_id = ur.area_id and s.id = p_store
    where ur.user_id = mgmt.current_user_id() and ur.area_id is not null and mgmt.is_current(ur.starts_on, ur.ends_on)
  union
  select a.role_id from mgmt.user_store_assignments a
    where a.user_id = mgmt.current_user_id() and a.store_id = p_store and mgmt.is_current(a.starts_on, a.ends_on)
$$;

-- 権限の判定。p_store を省略（NULL）したときは、全社の役職（社長・GM）だけで判定する
create or replace function mgmt.can(p_permission text, p_store uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from mgmt.role_permissions rp
    join mgmt.permissions p on p.id = rp.permission_id and p.code = p_permission
    where rp.role_id in (
      select mgmt.my_global_role_ids()
      union
      select mgmt.my_role_ids_for_store(p_store) where p_store is not null
    )
  )
$$;

-- どこか1つの店舗ででも、その権限を持っているか（メニューの表示用）
create or replace function mgmt.can_anywhere(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select mgmt.can(p_permission, null) or exists (
    select 1 from mgmt.stores s where mgmt.can(p_permission, s.id)
  )
$$;

-- 見られる店舗（全社＝全店舗／BM＝担当エリア／院長・スタッフ＝所属）
create or replace function mgmt.visible_store_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.id from mgmt.stores s
  where exists (
    select 1 from mgmt.my_global_role_ids()
  )
  or s.area_id in (
    select ur.area_id from mgmt.user_roles ur
    where ur.user_id = mgmt.current_user_id() and ur.area_id is not null and mgmt.is_current(ur.starts_on, ur.ends_on)
  )
  or s.id in (
    select a.store_id from mgmt.user_store_assignments a
    where a.user_id = mgmt.current_user_id() and mgmt.is_current(a.starts_on, a.ends_on)
  )
$$;

-- 画面用：自分のプロフィール・役職・所属
create or replace function mgmt.me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id, 'name', u.name, 'login_id', u.login_id, 'staff_code', u.staff_code,
    'must_change_password', u.must_change_password,
    'global_roles', coalesce((
      select jsonb_agg(jsonb_build_object('role', r.code, 'area_id', ur.area_id, 'area', ar.name) order by r.rank)
      from mgmt.user_roles ur join mgmt.roles r on r.id = ur.role_id left join mgmt.areas ar on ar.id = ur.area_id
      where ur.user_id = u.id and mgmt.is_current(ur.starts_on, ur.ends_on)), '[]'::jsonb),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object('store_id', s.id, 'store', s.name, 'role', r.code, 'is_primary', a.is_primary) order by s.display_order)
      from mgmt.user_store_assignments a join mgmt.stores s on s.id = a.store_id join mgmt.roles r on r.id = a.role_id
      where a.user_id = u.id and mgmt.is_current(a.starts_on, a.ends_on)), '[]'::jsonb)
  )
  from mgmt.users u where u.id = mgmt.current_user_id()
$$;

-- 初回ログイン後のPASS変更を記録（本人のみ）
create or replace function mgmt.mark_password_changed() returns void
language sql security definer set search_path = '' as $$
  update mgmt.users set must_change_password = false, updated_by = id where id = mgmt.current_user_id()
$$;

-- ===== RLS =====
alter table mgmt.areas enable row level security;
alter table mgmt.stores enable row level security;
alter table mgmt.roles enable row level security;
alter table mgmt.permissions enable row level security;
alter table mgmt.role_permissions enable row level security;
alter table mgmt.users enable row level security;
alter table mgmt.user_store_assignments enable row level security;
alter table mgmt.user_roles enable row level security;
alter table mgmt.audit_logs enable row level security;

-- マスタ：有効なユーザーは読める。変更は master.manage（社長）
create policy areas_select on mgmt.areas for select to authenticated using (mgmt.current_user_id() is not null);
create policy areas_write on mgmt.areas for insert to authenticated with check (mgmt.can('master.manage'));
create policy areas_update on mgmt.areas for update to authenticated using (mgmt.can('master.manage')) with check (mgmt.can('master.manage'));

create policy stores_select on mgmt.stores for select to authenticated using (mgmt.current_user_id() is not null);
create policy stores_insert on mgmt.stores for insert to authenticated with check (mgmt.can('master.manage'));
create policy stores_update on mgmt.stores for update to authenticated using (mgmt.can('master.manage')) with check (mgmt.can('master.manage'));

create policy roles_select on mgmt.roles for select to authenticated using (mgmt.current_user_id() is not null);
create policy permissions_select on mgmt.permissions for select to authenticated using (mgmt.current_user_id() is not null);
create policy role_permissions_select on mgmt.role_permissions for select to authenticated using (mgmt.current_user_id() is not null);

-- ユーザー：本人／見られる店舗にいる人（staff.view.store）／社長
create policy users_select on mgmt.users for select to authenticated using (
  id = mgmt.current_user_id()
  or mgmt.can('master.manage')
  or mgmt.can('staff.view.all')
  or exists (
    select 1 from mgmt.user_store_assignments a
    where a.user_id = mgmt.users.id and mgmt.is_current(a.starts_on, a.ends_on)
      and mgmt.can('staff.view.store', a.store_id)
  )
);
create policy users_insert on mgmt.users for insert to authenticated with check (mgmt.can('master.manage'));
create policy users_update on mgmt.users for update to authenticated using (mgmt.can('master.manage')) with check (mgmt.can('master.manage'));

create policy usa_select on mgmt.user_store_assignments for select to authenticated using (
  user_id = mgmt.current_user_id() or mgmt.can('staff.view.store', store_id)
);
create policy usa_insert on mgmt.user_store_assignments for insert to authenticated with check (mgmt.can('master.manage'));
create policy usa_update on mgmt.user_store_assignments for update to authenticated using (mgmt.can('master.manage')) with check (mgmt.can('master.manage'));

create policy user_roles_select on mgmt.user_roles for select to authenticated using (
  user_id = mgmt.current_user_id() or mgmt.can('master.manage') or mgmt.can('staff.view.all')
);
create policy user_roles_insert on mgmt.user_roles for insert to authenticated with check (mgmt.can('master.manage'));
create policy user_roles_update on mgmt.user_roles for update to authenticated using (mgmt.can('master.manage')) with check (mgmt.can('master.manage'));

create policy audit_select on mgmt.audit_logs for select to authenticated using (mgmt.can('audit.view'));

-- ===== 権限（GRANT） =====
grant select on all tables in schema mgmt to authenticated;
grant insert, update on mgmt.areas, mgmt.stores, mgmt.users, mgmt.user_store_assignments, mgmt.user_roles to authenticated;
revoke insert, update, delete on mgmt.audit_logs from authenticated;
revoke delete on all tables in schema mgmt from authenticated;
grant all on all tables in schema mgmt to service_role;
revoke all on all tables in schema mgmt from anon;

revoke execute on all functions in schema mgmt from public, anon;
grant execute on function mgmt.jst_today(), mgmt.is_current(date, date), mgmt.current_user_id(), mgmt.can(text, uuid),
  mgmt.can_anywhere(text), mgmt.visible_store_ids(), mgmt.me(), mgmt.mark_password_changed() to authenticated;
grant execute on all functions in schema mgmt to service_role;
