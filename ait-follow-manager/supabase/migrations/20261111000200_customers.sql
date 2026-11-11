-- =============================================================================
-- A.I.T Follow Manager — 02. 顧客・タグ・メモ・来店・予約・連絡同意
-- 医療情報・詳細な症状情報の列は設けない。
-- =============================================================================

create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  store_id          uuid not null,
  customer_code     text not null check (customer_code ~ '^[A-Za-z0-9_-]{1,30}$'),
  family_name       text not null check (char_length(family_name) between 1 and 50),
  given_name        text not null default '' check (char_length(given_name) <= 50),
  family_name_kana  text not null default '' check (char_length(family_name_kana) <= 50),
  given_name_kana   text not null default '' check (char_length(given_name_kana) <= 50),
  phone             text check (phone is null or phone ~ '^[0-9+() -]{1,20}$'),
  email             text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+$')),
  assigned_staff_id uuid references public.users(id) on delete set null,
  contact_status    text not null default 'unknown'
                    check (contact_status in ('unknown', 'allowed', 'not_allowed', 'unsubscribed')),
  first_visit_on    date,
  last_visit_on     date,
  search_text       text generated always as (
    lower(family_name || given_name || ' ' || family_name || ' ' || given_name || ' '
          || family_name_kana || given_name_kana || ' ' || customer_code || ' '
          || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'))
  ) stored,
  deleted_at        timestamptz,
  anonymized_at     timestamptz,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (organization_id, store_id) references public.stores(organization_id, id),
  unique (organization_id, customer_code),
  unique (organization_id, id)
);
create index customers_org_store_last_visit_idx on public.customers (organization_id, store_id, last_visit_on);
create index customers_org_assigned_idx on public.customers (organization_id, assigned_staff_id);
create index customers_search_trgm_idx on public.customers using gin (search_text extensions.gin_trgm_ops);
create trigger customers_updated_at before update on public.customers
  for each row execute function app.set_updated_at();

-- 顧客番号の自動採番・担当スタッフの所属検証
create or replace function app.customers_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seq bigint;
begin
  if tg_op = 'INSERT' and (new.customer_code is null or new.customer_code = '') then
    insert into public.organization_counters (organization_id, customer_seq)
    values (new.organization_id, 1)
    on conflict (organization_id) do update set customer_seq = public.organization_counters.customer_seq + 1
    returning customer_seq into seq;
    new.customer_code := 'C' || lpad(seq::text, 6, '0');
  end if;

  if new.assigned_staff_id is not null and (tg_op = 'INSERT' or new.assigned_staff_id is distinct from old.assigned_staff_id) then
    if not exists (
      select 1 from public.memberships m
      where m.user_id = new.assigned_staff_id
        and m.organization_id = new.organization_id
        and m.status = 'active'
        and (m.role = 'org_admin' or m.store_id = new.store_id)
    ) then
      raise exception '担当スタッフはこの店舗に所属していません' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- customer_code の列で null を許すため、insert 時のみ default を空文字に
alter table public.customers alter column customer_code set default '';
create trigger customers_before_write before insert or update on public.customers
  for each row execute function app.customers_before_write();

create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- tags / customer_tags
-- -----------------------------------------------------------------------------
create table public.tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 30),
  color           text not null default 'blue' check (color in ('blue', 'green', 'amber', 'red', 'gray', 'purple')),
  created_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.customer_tags (
  organization_id uuid not null,
  customer_id     uuid not null,
  tag_id          uuid not null,
  created_at      timestamptz not null default now(),
  primary key (customer_id, tag_id),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id) references public.tags(organization_id, id) on delete cascade
);
create index customer_tags_tag_idx on public.customer_tags (tag_id);

-- -----------------------------------------------------------------------------
-- customer_notes（対応メモ）
-- -----------------------------------------------------------------------------
create table public.customer_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id     uuid not null,
  author_id       uuid default auth.uid() references public.users(id) on delete set null,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

-- -----------------------------------------------------------------------------
-- visits（来店履歴）
-- -----------------------------------------------------------------------------
create table public.visits (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id        uuid not null,
  customer_id     uuid not null,
  visited_on      date not null check (visited_on >= date '2000-01-01'),
  staff_id        uuid references public.users(id) on delete set null,
  menu_label      text check (menu_label is null or char_length(menu_label) <= 100),
  source          text not null default 'manual' check (source in ('manual', 'csv')),
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade,
  foreign key (organization_id, store_id) references public.stores(organization_id, id)
);
create index visits_customer_idx on public.visits (customer_id, visited_on desc);
create index visits_org_date_idx on public.visits (organization_id, visited_on);

-- 初回・最終来店日の再計算
create or replace function app.refresh_customer_visit_dates(p_customer uuid) returns void
language sql security definer set search_path = '' as $$
  update public.customers c
     set first_visit_on = v.first_on, last_visit_on = v.last_on
    from (select min(visited_on) first_on, max(visited_on) last_on from public.visits where customer_id = p_customer) v
   where c.id = p_customer
     and (c.first_visit_on is distinct from v.first_on or c.last_visit_on is distinct from v.last_on);
$$;

create or replace function app.visits_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform app.refresh_customer_visit_dates(new.customer_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.refresh_customer_visit_dates(old.customer_id);
  end if;
  return null;
end $$;
create trigger visits_after_change after insert or update or delete on public.visits
  for each row execute function app.visits_after_change();

-- -----------------------------------------------------------------------------
-- appointments（予約）
-- -----------------------------------------------------------------------------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id        uuid not null,
  customer_id     uuid not null,
  scheduled_at    timestamptz not null,
  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
  source          text not null default 'manual' check (source in ('manual', 'csv', 'staff_reported')),
  external_ref    text check (external_ref is null or char_length(external_ref) <= 100),
  note            text check (note is null or char_length(note) <= 200),
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade,
  foreign key (organization_id, store_id) references public.stores(organization_id, id)
);
create index appointments_customer_idx on public.appointments (customer_id, scheduled_at);
create index appointments_org_sched_idx on public.appointments (organization_id, scheduled_at);
create trigger appointments_updated_at before update on public.appointments
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- consent_records（連絡同意・配信停止。追記専用）
-- -----------------------------------------------------------------------------
create table public.consent_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id     uuid not null,
  channel         text not null default 'all' check (channel in ('all', 'phone', 'line', 'email', 'sms')),
  status          text not null check (status in ('granted', 'not_allowed', 'unsubscribed')),
  source          text not null default 'verbal'
                  check (source in ('in_store_form', 'verbal', 'csv', 'customer_request', 'other')),
  note            text check (note is null or char_length(note) <= 200),
  recorded_by     uuid default auth.uid(),
  recorded_at     timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade
);
create index consent_records_customer_idx on public.consent_records (customer_id, recorded_at desc);

create trigger audit_consent_records after insert on public.consent_records
  for each row execute function app.audit_row_change();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.tags enable row level security;
alter table public.tags force row level security;
alter table public.customer_tags enable row level security;
alter table public.customer_tags force row level security;
alter table public.customer_notes enable row level security;
alter table public.customer_notes force row level security;
alter table public.visits enable row level security;
alter table public.visits force row level security;
alter table public.appointments enable row level security;
alter table public.appointments force row level security;
alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;

-- 顧客の可視性（関連表から参照する）
create or replace function app.customer_visible(p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer
      and c.deleted_at is null
      and app.can_view_customer(c.organization_id, c.store_id, c.assigned_staff_id)
  );
$$;
revoke all on function app.customer_visible(uuid) from public;
grant execute on function app.customer_visible(uuid) to authenticated, service_role;

create policy customers_select on public.customers for select to authenticated
  using (deleted_at is null and app.can_view_customer(organization_id, store_id, assigned_staff_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (app.can_access_store(organization_id, store_id) and deleted_at is null);
create policy customers_update on public.customers for update to authenticated
  using (deleted_at is null and app.can_view_customer(organization_id, store_id, assigned_staff_id))
  with check (app.can_access_store(organization_id, store_id));

create policy tags_select on public.tags for select to authenticated
  using (app.is_org_member(organization_id));
create policy tags_write on public.tags for insert to authenticated
  with check (app.is_org_member(organization_id));
create policy tags_update on public.tags for update to authenticated
  using (app.is_org_admin(organization_id)) with check (app.is_org_admin(organization_id));
create policy tags_delete on public.tags for delete to authenticated
  using (app.is_org_admin(organization_id));

create policy customer_tags_select on public.customer_tags for select to authenticated
  using (app.customer_visible(customer_id));
create policy customer_tags_insert on public.customer_tags for insert to authenticated
  with check (app.customer_visible(customer_id));
create policy customer_tags_delete on public.customer_tags for delete to authenticated
  using (app.customer_visible(customer_id));

create policy customer_notes_select on public.customer_notes for select to authenticated
  using (app.customer_visible(customer_id));
create policy customer_notes_insert on public.customer_notes for insert to authenticated
  with check (app.customer_visible(customer_id) and author_id = auth.uid());
create policy customer_notes_delete on public.customer_notes for delete to authenticated
  using (app.customer_visible(customer_id) and (author_id = auth.uid() or app.is_org_admin(organization_id)));

create policy visits_select on public.visits for select to authenticated
  using (app.customer_visible(customer_id));
create policy visits_insert on public.visits for insert to authenticated
  with check (app.customer_visible(customer_id) and app.can_access_store(organization_id, store_id));
create policy visits_update on public.visits for update to authenticated
  using (app.customer_visible(customer_id) and app.can_access_store(organization_id, store_id))
  with check (app.customer_visible(customer_id) and app.can_access_store(organization_id, store_id));
create policy visits_delete on public.visits for delete to authenticated
  using (app.customer_visible(customer_id) and app.can_manage_store(organization_id, store_id));

create policy appointments_select on public.appointments for select to authenticated
  using (app.customer_visible(customer_id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (app.customer_visible(customer_id) and app.can_access_store(organization_id, store_id));
create policy appointments_update on public.appointments for update to authenticated
  using (app.customer_visible(customer_id) and app.can_access_store(organization_id, store_id))
  with check (app.customer_visible(customer_id) and app.can_access_store(organization_id, store_id));

create policy consent_records_select on public.consent_records for select to authenticated
  using (app.customer_visible(customer_id));
create policy consent_records_insert on public.consent_records for insert to authenticated
  with check (app.customer_visible(customer_id) and recorded_by = auth.uid());

-- =============================================================================
-- GRANT（派生列 contact_status / first_visit_on / last_visit_on / deleted_at は直接更新不可）
-- =============================================================================
revoke all on public.customers, public.tags, public.customer_tags, public.customer_notes,
  public.visits, public.appointments, public.consent_records from anon, authenticated;

grant select on public.customers to authenticated;
grant insert (organization_id, store_id, customer_code, family_name, given_name, family_name_kana,
  given_name_kana, phone, email, assigned_staff_id) on public.customers to authenticated;
grant update (store_id, customer_code, family_name, given_name, family_name_kana, given_name_kana,
  phone, email, assigned_staff_id) on public.customers to authenticated;

grant select, insert, delete on public.tags to authenticated;
grant update (name, color) on public.tags to authenticated;
grant select, insert, delete on public.customer_tags to authenticated;
grant select, insert, delete on public.customer_notes to authenticated;
grant select, insert, delete on public.visits to authenticated;
grant update (visited_on, staff_id, menu_label, store_id) on public.visits to authenticated;
grant select, insert on public.appointments to authenticated;
grant update (scheduled_at, status, note, store_id) on public.appointments to authenticated;
grant select on public.consent_records to authenticated;
grant insert (organization_id, customer_id, channel, status, source, note, recorded_by) on public.consent_records to authenticated;

grant all on public.customers, public.tags, public.customer_tags, public.customer_notes,
  public.visits, public.appointments, public.consent_records to service_role;
