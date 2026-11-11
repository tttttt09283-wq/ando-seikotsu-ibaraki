-- =============================================================================
-- A.I.T Follow Manager — 01. テナント基盤（組織・店舗・ユーザー・所属・監査ログ）
-- 方針：全テナント表に RLS（force）。権限判定は app スキーマの security definer 関数に集約。
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- 共通：updated_at 自動更新
create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 100),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  status        text not null default 'active' check (status in ('active', 'suspended')),
  timezone      text not null default 'Asia/Tokyo',
  phone         text check (phone is null or char_length(phone) <= 20),
  address       text check (address is null or char_length(address) <= 200),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  settings      jsonb not null default '{"include_unknown_consent": false, "staff_visibility": "store"}'::jsonb,
  limits        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();

-- 顧客番号の採番カウンタ（組織ごと）
create table public.organization_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  customer_seq    bigint not null default 0
);

-- -----------------------------------------------------------------------------
-- stores
-- -----------------------------------------------------------------------------
create table public.stores (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 100),
  code            text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  phone           text check (phone is null or char_length(phone) <= 20),
  address         text check (address is null or char_length(address) <= 200),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);
create trigger stores_updated_at before update on public.stores
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- users（auth.users と 1:1。パスワードは Supabase Auth が管理し、ここには持たない）
-- -----------------------------------------------------------------------------
create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 50),
  email        text not null default '',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger users_updated_at before update on public.users
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)), 50)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- platform_admins（memberships とは別表。顧客データの RLS には一切一致しない）
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references public.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- memberships
-- -----------------------------------------------------------------------------
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id        uuid,
  role            text not null check (role in ('org_admin', 'store_manager', 'staff')),
  status          text not null default 'active' check (status in ('active', 'disabled')),
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, store_id) references public.stores(organization_id, id) on delete cascade,
  check ((role = 'org_admin' and store_id is null) or (role <> 'org_admin' and store_id is not null)),
  unique nulls not distinct (user_id, organization_id, store_id)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create index memberships_org_store_idx on public.memberships (organization_id, store_id);
create trigger memberships_updated_at before update on public.memberships
  for each row execute function app.set_updated_at();

-- =============================================================================
-- 権限判定ヘルパー（security definer：memberships の RLS 再帰を避ける）
-- =============================================================================

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

-- 自分が active な所属を持ち、かつ組織が active か
create or replace function app.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    join public.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and m.organization_id = org
      and m.status = 'active'
      and o.status = 'active'
      and u.is_active
  );
$$;

create or replace function app.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    join public.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and m.organization_id = org
      and m.role = 'org_admin'
      and m.status = 'active'
      and o.status = 'active'
      and u.is_active
  );
$$;

-- 店舗にアクセスできるか（org_admin は組織内全店舗、それ以外は所属店舗のみ）
create or replace function app.can_access_store(org uuid, store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_org_admin(org) or exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    join public.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and m.organization_id = org
      and m.store_id = store
      and m.status = 'active'
      and o.status = 'active'
      and u.is_active
  );
$$;

-- 店舗の管理権限（org_admin、または当該店舗の store_manager）。store が null なら org_admin のみ
create or replace function app.can_manage_store(org uuid, store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_org_admin(org) or (store is not null and exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    join public.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and m.organization_id = org
      and m.store_id = store
      and m.role = 'store_manager'
      and m.status = 'active'
      and o.status = 'active'
      and u.is_active
  ));
$$;

-- 顧客の閲覧可否（Staff の閲覧範囲設定を店舗ごとのロールで判定）
create or replace function app.can_view_customer(org uuid, store uuid, assigned uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_access_store(org, store) and (
    app.can_manage_store(org, store)
    or assigned = auth.uid()
    or coalesce((select o.settings ->> 'staff_visibility' from public.organizations o where o.id = org), 'store') = 'store'
  );
$$;

-- 自分と同じ組織に所属するユーザーか（スタッフ名の表示用）
create or replace function app.shares_org_with(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = target
  );
$$;

revoke all on all functions in schema app from public;
grant execute on function
  app.is_platform_admin(), app.is_org_member(uuid), app.is_org_admin(uuid),
  app.can_access_store(uuid, uuid), app.can_manage_store(uuid, uuid),
  app.can_view_customer(uuid, uuid, uuid), app.shares_org_with(uuid)
to authenticated, service_role;

-- =============================================================================
-- audit_logs（追記専用）
-- =============================================================================
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id   uuid,
  action          text not null check (char_length(action) <= 60),
  entity_type     text not null check (char_length(entity_type) <= 60),
  entity_id       uuid,
  changes         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

-- 監査ログの書き込み（内部用）
create or replace function app.write_audit(
  org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_changes jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, changes)
  values (org, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_changes, '{}'::jsonb));
$$;
revoke all on function app.write_audit(uuid, text, text, uuid, jsonb) from public;

-- アプリから明示的に記録する操作（エクスポート等）。所属組織に対してのみ記録可能
create or replace function public.log_audit_event(
  org uuid, p_action text, p_entity_type text, p_entity_id uuid default null, p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_org_member(org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z_.]{1,60}$' then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  perform app.write_audit(org, p_action, p_entity_type, p_entity_id, p_details);
end $$;
revoke all on function public.log_audit_event(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) to authenticated;

-- 汎用監査トリガー：変更列名のみ記録（個人情報の値は残さない）。status/role 列は値も記録
create or replace function app.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  row_j jsonb := case when tg_op = 'DELETE' then old_j else new_j end;
  changed text[];
  details jsonb;
  k text;
begin
  select coalesce(array_agg(key order by key), '{}')
    into changed
  from (
    select key from jsonb_each(new_j)
    where key not in ('updated_at', 'created_at', 'search_text')
      and (old_j -> key) is distinct from (new_j -> key)
  ) s;

  if tg_op = 'UPDATE' and cardinality(changed) = 0 then
    return null;
  end if;

  details := jsonb_build_object('fields', to_jsonb(changed));
  foreach k in array array['status', 'role', 'is_active', 'contact_status', 'channel', 'outcome', 'close_reason'] loop
    if row_j ? k then
      details := details || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
    end if;
  end loop;

  perform app.write_audit(
    (row_j ->> 'organization_id')::uuid,
    lower(tg_table_name || '.' || tg_op),
    tg_table_name,
    (row_j ->> 'id')::uuid,
    details
  );
  return null;
end $$;

create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function app.audit_row_change();
create trigger audit_stores after insert or update or delete on public.stores
  for each row execute function app.audit_row_change();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.organization_counters enable row level security;
alter table public.organization_counters force row level security;
alter table public.stores enable row level security;
alter table public.stores force row level security;
alter table public.users enable row level security;
alter table public.users force row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- organizations：所属組織のみ閲覧（停止中でも org_admin が状態を確認できるよう所属のみで判定）
create policy organizations_select on public.organizations for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = organizations.id and m.user_id = auth.uid() and m.status = 'active'
  ));
create policy organizations_update on public.organizations for update to authenticated
  using (app.is_org_admin(id)) with check (app.is_org_admin(id));

-- stores
create policy stores_select on public.stores for select to authenticated
  using (app.is_org_member(organization_id));
create policy stores_insert on public.stores for insert to authenticated
  with check (app.is_org_admin(organization_id));
create policy stores_update on public.stores for update to authenticated
  using (app.can_manage_store(organization_id, id))
  with check (app.can_manage_store(organization_id, id));

-- users：本人＋同じ組織のメンバー
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or app.shares_org_with(id));
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- platform_admins：本人のみ自分の行を確認できる
create policy platform_admins_select_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    or app.is_org_admin(organization_id)
    or (store_id is not null and app.can_manage_store(organization_id, store_id))
  );
-- org_admin は全ロールを付与可能。store_manager は自店舗の staff のみ
create policy memberships_insert on public.memberships for insert to authenticated
  with check (
    app.is_org_admin(organization_id)
    or (role = 'staff' and app.can_manage_store(organization_id, store_id))
  );
create policy memberships_update on public.memberships for update to authenticated
  using (
    app.is_org_admin(organization_id)
    or (role = 'staff' and app.can_manage_store(organization_id, store_id))
  )
  with check (
    app.is_org_admin(organization_id)
    or (role = 'staff' and app.can_manage_store(organization_id, store_id))
  );

-- audit_logs：org_admin が自組織分のみ閲覧。書き込みは関数経由のみ
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (organization_id is not null and app.is_org_admin(organization_id));

-- =============================================================================
-- 権限（GRANT）：anon には一切付与しない。更新は列単位で許可
-- =============================================================================
revoke all on public.organizations, public.organization_counters, public.stores, public.users,
  public.platform_admins, public.memberships, public.audit_logs from anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name, phone, address, contact_email, timezone, settings) on public.organizations to authenticated;

grant select, insert on public.stores to authenticated;
grant update (name, code, phone, address, is_active) on public.stores to authenticated;

grant select on public.users to authenticated;
grant update (display_name) on public.users to authenticated;

grant select on public.platform_admins to authenticated;

grant select on public.memberships to authenticated;
grant insert (user_id, organization_id, store_id, role, status) on public.memberships to authenticated;
grant update (status) on public.memberships to authenticated;

grant select on public.audit_logs to authenticated;

grant all on public.organizations, public.organization_counters, public.stores, public.users,
  public.platform_admins, public.memberships, public.audit_logs to service_role;
