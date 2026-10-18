-- 0002: 店舗・スタッフ・所属・雇用契約・ロールのマスタ

-- ===== 列挙型 =====
create type public.clinic_status as enum ('active', 'suspended', 'closed');
create type public.staff_status as enum ('active', 'on_leave', 'retired');
create type public.assignment_type as enum ('primary', 'support');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'other');
create type public.working_time_system as enum ('standard', 'monthly_variable', 'other');
create type public.app_role as enum ('super_admin', 'hq_admin', 'clinic_manager', 'staff');

-- ===== 店舗 =====
-- clinic_id を主キーとし、名称変更しても過去の勤怠は clinic_id で紐付いたまま残る。
create table public.clinics (
  clinic_id     uuid primary key default gen_random_uuid(),
  clinic_code   text not null unique check (clinic_code ~ '^[A-Z0-9_-]{2,20}$'),
  name          text not null check (length(btrim(name)) > 0),
  status        public.clinic_status not null default 'active',
  opened_on     date,
  suspended_on  date,
  closed_on     date,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint clinics_closed_on_required check (status <> 'closed' or closed_on is not null),
  constraint clinics_suspended_on_required check (status <> 'suspended' or suspended_on is not null)
);

-- 帳票で「当時の院名」を出すための名称履歴（トリガーで自動記録）
create table public.clinic_name_history (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (clinic_id),
  name        text not null,
  valid_from  timestamptz not null default now(),
  valid_to    timestamptz,
  changed_by  uuid
);
create index clinic_name_history_clinic_idx on public.clinic_name_history (clinic_id, valid_from);

create or replace function app.record_clinic_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.clinic_name_history (clinic_id, name, valid_from, changed_by)
    values (new.clinic_id, new.name, now(), auth.uid());
  elsif new.name is distinct from old.name then
    update public.clinic_name_history
       set valid_to = now()
     where clinic_id = new.clinic_id and valid_to is null;
    insert into public.clinic_name_history (clinic_id, name, valid_from, changed_by)
    values (new.clinic_id, new.name, now(), auth.uid());
  end if;
  return new;
end;
$$;

create trigger clinics_record_name
  after insert or update of name on public.clinics
  for each row execute function app.record_clinic_name();
create trigger clinics_forbid_delete
  before delete on public.clinics
  for each row execute function app.forbid_delete();
create trigger clinics_touch
  before update on public.clinics
  for each row execute function app.touch_updated_at();

-- ===== スタッフ =====
-- 基本情報（氏名・スタッフコード）。応援先の院長も参照できる最小限の情報のみ置く。
create table public.staff_profiles (
  staff_id          uuid primary key default gen_random_uuid(),
  staff_code        text not null unique check (staff_code ~ '^[0-9]{4,8}$'),
  auth_user_id      uuid unique references auth.users (id) on delete set null,
  family_name       text not null check (length(btrim(family_name)) > 0),
  given_name        text not null check (length(btrim(given_name)) > 0),
  family_name_kana  text,
  given_name_kana   text,
  hire_date         date not null,
  retire_date       date,
  status            public.staff_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint staff_retire_after_hire check (retire_date is null or retire_date >= hire_date)
);

create trigger staff_profiles_forbid_delete
  before delete on public.staff_profiles
  for each row execute function app.forbid_delete();
create trigger staff_profiles_touch
  before update on public.staff_profiles
  for each row execute function app.touch_updated_at();

-- 個人情報。院長は「主所属院」の院長のみ閲覧できる（応援先の院長は不可）。
create table public.staff_private_details (
  staff_id                 uuid primary key references public.staff_profiles (staff_id),
  birth_date               date,
  phone                    text,
  email                    text,
  postal_code              text,
  address                  text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  notes                    text,
  updated_at               timestamptz not null default now()
);

create trigger staff_private_details_touch
  before update on public.staff_private_details
  for each row execute function app.touch_updated_at();

-- ===== 所属（主所属・応援・異動） =====
-- 異動は「旧レコードの valid_to を設定＋新レコード追加」で表現し、履歴を残す。
create table public.staff_clinic_assignments (
  assignment_id    uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references public.staff_profiles (staff_id),
  clinic_id        uuid not null references public.clinics (clinic_id),
  assignment_type  public.assignment_type not null,
  valid_from       date not null,
  valid_to         date,
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  constraint assignment_period check (valid_to is null or valid_to >= valid_from),
  -- 主所属は同一期間に1院のみ
  constraint assignment_primary_no_overlap exclude using gist (
    staff_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  ) where (assignment_type = 'primary'),
  -- 同じ院への応援登録の期間重複も禁止
  constraint assignment_support_no_overlap exclude using gist (
    staff_id with =,
    clinic_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  ) where (assignment_type = 'support')
);
create index staff_clinic_assignments_clinic_idx on public.staff_clinic_assignments (clinic_id);
create index staff_clinic_assignments_staff_idx on public.staff_clinic_assignments (staff_id);

create trigger staff_clinic_assignments_forbid_delete
  before delete on public.staff_clinic_assignments
  for each row execute function app.forbid_delete();

-- ===== 雇用契約・勤務条件 =====
-- 集計は勤務日時点で有効な契約を参照する。勤務制度名だけで祝日勤務休日の対象を判定しない（別テーブルで管理）。
create table public.employment_contracts (
  contract_id                 uuid primary key default gen_random_uuid(),
  staff_id                    uuid not null references public.staff_profiles (staff_id),
  valid_from                  date not null,
  valid_to                    date,
  employment_type             public.employment_type not null,
  working_time_system         public.working_time_system not null default 'standard',
  weekly_scheduled_days       numeric(2, 1) not null check (weekly_scheduled_days between 0 and 7),
  weekly_scheduled_minutes    integer not null check (weekly_scheduled_minutes between 0 and 10080),
  daily_scheduled_minutes     integer not null check (daily_scheduled_minutes between 0 and 1440),
  -- 週の法定労働時間：40h(2400分) または 特例措置対象事業場の44h(2640分)
  legal_weekly_limit_minutes  integer not null default 2400 check (legal_weekly_limit_minutes in (2400, 2640)),
  -- 法定休日の曜日（0=日曜 … 6=土曜）。NULL は「週の最後の休日」ルールで判定する想定
  legal_holiday_weekday       smallint check (legal_holiday_weekday between 0 and 6),
  hourly_leave_enabled        boolean not null default false,
  note                        text,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint contract_period check (valid_to is null or valid_to >= valid_from),
  constraint contract_no_overlap exclude using gist (
    staff_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create trigger employment_contracts_forbid_delete
  before delete on public.employment_contracts
  for each row execute function app.forbid_delete();
create trigger employment_contracts_touch
  before update on public.employment_contracts
  for each row execute function app.touch_updated_at();

-- ===== 管理画面アカウント =====
-- auth.users はクライアントから読めないため、表示用のメール・氏名をここに持つ。
create table public.app_accounts (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  display_name  text not null,
  disabled      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger app_accounts_touch
  before update on public.app_accounts
  for each row execute function app.touch_updated_at();

-- ===== ロール =====
-- clinic_manager は院単位で付与する（兼務＝複数行）。失効は valid_to で表し、行は削除しない。
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.app_role not null,
  clinic_id   uuid references public.clinics (clinic_id),
  valid_from  date not null default app.today_jst(),
  valid_to    date,
  granted_by  uuid,
  created_at  timestamptz not null default now(),
  constraint user_roles_clinic_scope check ((role = 'clinic_manager') = (clinic_id is not null)),
  constraint user_roles_period check (valid_to is null or valid_to >= valid_from),
  constraint user_roles_no_overlap exclude using gist (
    user_id with =,
    role with =,
    (coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);
create index user_roles_user_idx on public.user_roles (user_id);

create trigger user_roles_forbid_delete
  before delete on public.user_roles
  for each row execute function app.forbid_delete();
