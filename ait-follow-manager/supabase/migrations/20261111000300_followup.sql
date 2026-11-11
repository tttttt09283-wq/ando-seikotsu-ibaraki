-- =============================================================================
-- A.I.T Follow Manager — 03. テンプレート・フォロールール・タスク・連絡記録・CSV取込
-- Phase 1 ではシステムから外部送信しない。contact_logs はスタッフの手動記録。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- message_templates
-- -----------------------------------------------------------------------------
create table public.message_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id        uuid,
  category        text not null check (category in
                    ('thanks_first_visit', 'condition_check', 'next_appointment', 'lapsed', 'seasonal', 'other')),
  name            text not null check (char_length(name) between 1 and 60),
  body            text not null check (char_length(body) between 1 and 2000),
  is_archived     boolean not null default false,
  version         integer not null default 1,
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, store_id) references public.stores(organization_id, id),
  unique (organization_id, id)
);
create index message_templates_org_idx on public.message_templates (organization_id, category);

create or replace function app.templates_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body or new.name is distinct from old.name then
    new.version := old.version + 1;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger message_templates_before_update before update on public.message_templates
  for each row execute function app.templates_before_update();
create trigger audit_message_templates after insert or update on public.message_templates
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- followup_rules
-- -----------------------------------------------------------------------------
create table public.followup_rules (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  store_id            uuid,
  name                text not null check (char_length(name) between 1 and 60),
  rule_type           text not null check (rule_type in
                        ('days_since_first_visit', 'days_since_last_visit',
                         'no_confirmed_next_appointment', 'days_since_last_followup')),
  offset_days         integer not null check (offset_days between 0 and 730),
  due_in_days         integer not null default 3 check (due_in_days between 0 and 30),
  max_lookback_days   integer not null default 30 check (max_lookback_days between 0 and 365),
  task_kind           text not null default 'contact' check (task_kind in ('contact', 'internal')),
  priority            text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  assignee_strategy   text not null default 'customer_staff'
                      check (assignee_strategy in ('customer_staff', 'store_manager', 'unassigned')),
  default_template_id uuid,
  is_active           boolean not null default true,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, store_id) references public.stores(organization_id, id),
  foreign key (organization_id, default_template_id) references public.message_templates(organization_id, id),
  unique (organization_id, id)
);
create trigger followup_rules_updated_at before update on public.followup_rules
  for each row execute function app.set_updated_at();
create trigger audit_followup_rules after insert or update on public.followup_rules
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- followup_tasks
-- -----------------------------------------------------------------------------
create table public.followup_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id        uuid not null,
  customer_id     uuid not null,
  rule_id         uuid,
  period_key      text check (period_key is null or char_length(period_key) <= 60),
  title           text not null check (char_length(title) between 1 and 80),
  task_kind       text not null default 'contact' check (task_kind in ('contact', 'internal')),
  status          text not null default 'open' check (status in ('open', 'done', 'on_hold', 'not_applicable')),
  priority        text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  due_on          date not null,
  assigned_to     uuid references public.users(id) on delete set null,
  template_id     uuid,
  close_reason    text check (close_reason is null or close_reason in
                    ('manual', 'condition_resolved', 'contact_not_allowed', 'customer_deleted')),
  result_note     text check (result_note is null or char_length(result_note) <= 1000),
  completed_at    timestamptz,
  completed_by    uuid,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade,
  foreign key (organization_id, store_id) references public.stores(organization_id, id),
  foreign key (organization_id, rule_id) references public.followup_rules(organization_id, id),
  foreign key (organization_id, template_id) references public.message_templates(organization_id, id),
  -- 重複防止：同じ組織・ルール・顧客・対象期間のタスクは1件のみ（手動タスクは rule_id が null のため対象外）
  constraint followup_tasks_dedupe unique (organization_id, rule_id, customer_id, period_key),
  check ((rule_id is null) = (period_key is null)),
  check (status <> 'not_applicable' or close_reason is not null)
);
create index followup_tasks_org_status_due_idx on public.followup_tasks (organization_id, status, due_on);
create index followup_tasks_assigned_idx on public.followup_tasks (organization_id, assigned_to, status);
create index followup_tasks_customer_idx on public.followup_tasks (customer_id, created_at desc);

create or replace function app.tasks_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Staff は担当者を「自分」にのみ変更できる（店舗管理者以上は誰でも割当可能）
  if new.assigned_to is distinct from old.assigned_to
     and auth.uid() is not null
     and not app.can_manage_store(new.organization_id, new.store_id)
     and new.assigned_to is distinct from auth.uid() then
    raise exception '担当者の変更は店舗管理者以上のみ可能です' using errcode = '42501';
  end if;

  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to and not exists (
    select 1 from public.memberships m
    where m.user_id = new.assigned_to and m.organization_id = new.organization_id and m.status = 'active'
      and (m.role = 'org_admin' or m.store_id = new.store_id)
  ) then
    raise exception '担当者はこの店舗に所属していません' using errcode = '23514';
  end if;

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  if new.status <> 'not_applicable' then
    new.close_reason := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger followup_tasks_before_update before update on public.followup_tasks
  for each row execute function app.tasks_before_update();
create trigger audit_followup_tasks after update on public.followup_tasks
  for each row when (old.status is distinct from new.status or old.assigned_to is distinct from new.assigned_to)
  execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- contact_logs（対応記録。追記専用）
-- -----------------------------------------------------------------------------
create table public.contact_logs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  store_id            uuid not null,
  customer_id         uuid not null,
  task_id             uuid references public.followup_tasks(id) on delete set null,
  template_id         uuid,
  channel             text not null check (channel in
                        ('phone', 'line_manual', 'email_manual', 'sms_manual', 'in_person', 'other')),
  outcome             text not null check (outcome in
                        ('reached', 'no_answer', 'sent', 'replied', 'appointment_reported', 'declined', 'other')),
  content             text check (content is null or char_length(content) <= 2000),
  contacted_at        timestamptz not null default now(),
  staff_id            uuid default auth.uid(),
  -- Phase 2（LINE 送信）で使用。Phase 1 は常に null
  external_message_id text,
  created_at          timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade,
  foreign key (organization_id, store_id) references public.stores(organization_id, id),
  foreign key (organization_id, template_id) references public.message_templates(organization_id, id)
);
create index contact_logs_customer_idx on public.contact_logs (customer_id, contacted_at desc);
create index contact_logs_org_idx on public.contact_logs (organization_id, contacted_at);

-- -----------------------------------------------------------------------------
-- import_jobs（CSV取込の結果。エラーには値そのものを保存しない）
-- -----------------------------------------------------------------------------
create table public.import_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id        uuid not null,
  kind            text not null check (kind in ('customers', 'visits', 'appointments')),
  status          text not null default 'completed' check (status in ('completed', 'failed')),
  file_name       text check (file_name is null or char_length(file_name) <= 200),
  total_rows      integer not null default 0,
  inserted_rows   integer not null default 0,
  updated_rows    integer not null default 0,
  error_rows      integer not null default 0,
  errors          jsonb not null default '[]'::jsonb,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, store_id) references public.stores(organization_id, id)
);

-- =============================================================================
-- 連絡同意の記録 → 顧客の contact_status を更新し、連絡不可なら未完了の連絡タスクを対象外に
-- =============================================================================
create or replace function app.consent_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  next_status text;
begin
  if new.channel <> 'all' then
    return null;
  end if;
  next_status := case new.status when 'granted' then 'allowed' else new.status end;

  update public.customers set contact_status = next_status where id = new.customer_id;

  if new.status in ('not_allowed', 'unsubscribed') then
    update public.followup_tasks
       set status = 'not_applicable', close_reason = 'contact_not_allowed'
     where customer_id = new.customer_id
       and task_kind = 'contact'
       and status in ('open', 'on_hold');
  end if;
  return null;
end $$;
create trigger consent_after_insert after insert on public.consent_records
  for each row execute function app.consent_after_insert();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.message_templates enable row level security;
alter table public.message_templates force row level security;
alter table public.followup_rules enable row level security;
alter table public.followup_rules force row level security;
alter table public.followup_tasks enable row level security;
alter table public.followup_tasks force row level security;
alter table public.contact_logs enable row level security;
alter table public.contact_logs force row level security;
alter table public.import_jobs enable row level security;
alter table public.import_jobs force row level security;

create policy message_templates_select on public.message_templates for select to authenticated
  using (app.is_org_member(organization_id) and (store_id is null or app.can_access_store(organization_id, store_id)));
create policy message_templates_insert on public.message_templates for insert to authenticated
  with check (app.can_manage_store(organization_id, store_id));
create policy message_templates_update on public.message_templates for update to authenticated
  using (app.can_manage_store(organization_id, store_id))
  with check (app.can_manage_store(organization_id, store_id));

create policy followup_rules_select on public.followup_rules for select to authenticated
  using (app.is_org_member(organization_id) and (store_id is null or app.can_access_store(organization_id, store_id)));
create policy followup_rules_insert on public.followup_rules for insert to authenticated
  with check (app.can_manage_store(organization_id, store_id));
create policy followup_rules_update on public.followup_rules for update to authenticated
  using (app.can_manage_store(organization_id, store_id))
  with check (app.can_manage_store(organization_id, store_id));

create policy followup_tasks_select on public.followup_tasks for select to authenticated
  using (app.customer_visible(customer_id));
-- 手動タスクのみユーザーが作成可能（ルール由来のタスクは抽出ジョブが作成）
create policy followup_tasks_insert on public.followup_tasks for insert to authenticated
  with check (rule_id is null and app.customer_visible(customer_id) and app.can_access_store(organization_id, store_id));
create policy followup_tasks_update on public.followup_tasks for update to authenticated
  using (app.customer_visible(customer_id))
  with check (app.customer_visible(customer_id));

create policy contact_logs_select on public.contact_logs for select to authenticated
  using (app.customer_visible(customer_id));
create policy contact_logs_insert on public.contact_logs for insert to authenticated
  with check (app.customer_visible(customer_id) and staff_id = auth.uid() and external_message_id is null);

create policy import_jobs_select on public.import_jobs for select to authenticated
  using (app.can_manage_store(organization_id, store_id));
create policy import_jobs_insert on public.import_jobs for insert to authenticated
  with check (app.can_manage_store(organization_id, store_id));

-- =============================================================================
-- GRANT
-- =============================================================================
revoke all on public.message_templates, public.followup_rules, public.followup_tasks,
  public.contact_logs, public.import_jobs from anon, authenticated;

grant select on public.message_templates to authenticated;
grant insert (organization_id, store_id, category, name, body) on public.message_templates to authenticated;
grant update (category, name, body, is_archived) on public.message_templates to authenticated;

grant select on public.followup_rules to authenticated;
grant insert (organization_id, store_id, name, rule_type, offset_days, due_in_days, max_lookback_days,
  task_kind, priority, assignee_strategy, default_template_id, is_active) on public.followup_rules to authenticated;
grant update (name, offset_days, due_in_days, max_lookback_days, task_kind, priority,
  assignee_strategy, default_template_id, is_active) on public.followup_rules to authenticated;

grant select on public.followup_tasks to authenticated;
grant insert (organization_id, store_id, customer_id, title, task_kind, priority, due_on, assigned_to, template_id)
  on public.followup_tasks to authenticated;
grant update (status, assigned_to, due_on, close_reason, result_note) on public.followup_tasks to authenticated;

grant select on public.contact_logs to authenticated;
grant insert (organization_id, store_id, customer_id, task_id, template_id, channel, outcome, content, contacted_at, staff_id)
  on public.contact_logs to authenticated;

grant select on public.import_jobs to authenticated;
grant insert (organization_id, store_id, kind, status, file_name, total_rows, inserted_rows, updated_rows, error_rows, errors)
  on public.import_jobs to authenticated;

grant all on public.message_templates, public.followup_rules, public.followup_tasks,
  public.contact_logs, public.import_jobs to service_role;
