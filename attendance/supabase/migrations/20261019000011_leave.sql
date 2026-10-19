-- 0011: 有給休暇・祝日勤務の振休の台帳（フェーズ4）
--
-- 有給休暇
--   - 付与単位（leave_grants）ごとに残数を管理。残数は台帳（leave_ledger_entries）の合計で再計算できる
--   - 取得は「スタッフ申請 → 院長一次承認 → 本部最終承認 → 台帳（期限の近い付与から消化）→ シフト反映」
--   - 申請中の日数は予約残数として差し引き、残数の二重使用を防ぐ
--   - 承認後の取消は「使用の戻し」エントリで返還。同じ使用の二重返還は一意制約で防ぐ
-- 祝日勤務の振休（確定ルール A5・A6）
--   - 付与対象スタッフ（個別設定）が会社カレンダーの対象祝日に勤務し、院長確認済みの実績がある → 付与候補
--   - 院長が「当日使用できなかった」と報告（承認待ち）→ 本部承認で台帳に1日加算（単一トランザクション）
--   - 同じ勤務実績への二重付与は一意制約で防止。期限は原則その月末（本部が個別に変更可）
--   - 法的な振替休日・代休とは区分を分け、ポリシーが有効な区分だけ正式付与できる

-- 共用端末からの申請はログインユーザーがいないため、承認ログの操作者を空欄にできるようにする
alter table public.approval_logs alter column actor_id drop not null;

-- ===== 休暇の種類と設定 =====
create type public.leave_type as enum ('paid', 'holiday_credit', 'other');

create table public.leave_policies (
  leave_type               public.leave_type primary key,
  name                     text not null,
  half_day_allowed         boolean not null default true,
  -- 時間単位年休は労使協定がある場合のみ有効にする（スタッフの勤務条件でも有効化が必要）
  hourly_allowed           boolean not null default false,
  hourly_max_days_per_year integer not null default 5 check (hourly_max_days_per_year between 0 and 5),
  agreement_note           text,
  updated_by               uuid,
  updated_at               timestamptz not null default now()
);
insert into public.leave_policies (leave_type, name) values
  ('paid', '年次有給休暇'),
  ('holiday_credit', '振休（祝日勤務）'),
  ('other', 'その他会社指定休暇');

-- ===== 有給：付与単位 =====
create type public.leave_grant_type as enum ('statutory', 'proportional', 'advance', 'manual', 'migration');

create table public.leave_grants (
  leave_grant_id      uuid primary key default gen_random_uuid(),
  staff_id            uuid not null references public.staff_profiles (staff_id),
  grant_date          date not null,
  granted_days        numeric(5, 2) not null check (granted_days > 0 and granted_days <= 40),
  used_days           numeric(5, 2) not null default 0,   -- 台帳から計算したキャッシュ
  expired_days        numeric(5, 2) not null default 0,   -- 同上
  adjusted_days       numeric(5, 2) not null default 0,   -- 同上
  expiration_date     date not null,
  grant_type          public.leave_grant_type not null,
  annual_5day_target  boolean not null default false,     -- 年5日取得義務の対象（10日以上の付与）
  note                text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  constraint leave_grants_expiration check (expiration_date > grant_date)
);
create index leave_grants_staff_idx on public.leave_grants (staff_id, expiration_date);

create trigger leave_grants_forbid_delete
  before delete on public.leave_grants
  for each row execute function app.forbid_delete();

-- ===== 休暇申請 =====
create type public.leave_request_status as enum ('pending', 'manager_approved', 'approved', 'rejected', 'cancelled');
create type public.leave_unit as enum ('full', 'am', 'pm', 'hour');

create table public.leave_requests (
  leave_request_id     uuid primary key default gen_random_uuid(),
  staff_id             uuid not null references public.staff_profiles (staff_id),
  home_clinic_id       uuid references public.clinics (clinic_id),
  leave_type           public.leave_type not null,
  start_date           date not null,
  end_date             date not null,
  unit                 public.leave_unit not null default 'full',
  minutes              integer check (minutes is null or minutes between 60 and 480),
  days_requested       numeric(5, 2) not null check (days_requested > 0),
  note                 text,
  status               public.leave_request_status not null default 'pending',
  requested_via        text not null check (requested_via in ('kiosk', 'web', 'proxy')),
  requested_by         uuid,
  manager_approved_by  uuid,
  manager_approved_at  timestamptz,
  hq_approved_by       uuid,
  hq_approved_at       timestamptz,
  rejected_by          uuid,
  rejected_at          timestamptz,
  reject_reason        text,
  cancelled_by         uuid,
  cancelled_at         timestamptz,
  cancel_reason        text,
  applied_shift_ids    uuid[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint leave_requests_range check (end_date >= start_date and end_date - start_date <= 30),
  constraint leave_requests_partial_day check (unit = 'full' or start_date = end_date),
  constraint leave_requests_hour_minutes check ((unit = 'hour') = (minutes is not null))
);
create index leave_requests_staff_idx on public.leave_requests (staff_id, start_date);
create index leave_requests_status_idx on public.leave_requests (status, home_clinic_id);

create trigger leave_requests_touch
  before update on public.leave_requests
  for each row execute function app.touch_updated_at();
create trigger leave_requests_forbid_delete
  before delete on public.leave_requests
  for each row execute function app.forbid_delete();

-- ===== 有給：台帳（追記専用） =====
create type public.leave_entry_type as enum ('grant', 'use', 'use_reversal', 'expire', 'adjust');

create table public.leave_ledger_entries (
  entry_id              uuid primary key default gen_random_uuid(),
  staff_id              uuid not null references public.staff_profiles (staff_id),
  leave_grant_id        uuid not null references public.leave_grants (leave_grant_id),
  leave_request_id      uuid references public.leave_requests (leave_request_id),
  entry_type            public.leave_entry_type not null,
  days                  numeric(6, 2) not null check (days <> 0),
  effective_date        date not null,
  reversal_of_entry_id  uuid unique references public.leave_ledger_entries (entry_id),  -- 同じ使用の二重返還を防ぐ
  note                  text,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  constraint leave_entry_sign check (
    (entry_type = 'grant' and days > 0)
    or (entry_type = 'use' and days < 0)
    or (entry_type = 'use_reversal' and days > 0 and reversal_of_entry_id is not null)
    or (entry_type = 'expire' and days < 0)
    or entry_type = 'adjust'
  )
);
create index leave_ledger_staff_idx on public.leave_ledger_entries (staff_id, effective_date);
create index leave_ledger_grant_idx on public.leave_ledger_entries (leave_grant_id);

create trigger leave_ledger_forbid_mutation
  before update or delete on public.leave_ledger_entries
  for each row execute function app.forbid_mutation();

-- 台帳の追加に合わせて付与単位のキャッシュ列を更新する（同一トランザクション）
create or replace function app.sync_leave_grant_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leave_grants g
     set used_days = g.used_days + case when new.entry_type in ('use', 'use_reversal') then -new.days else 0 end,
         expired_days = g.expired_days + case when new.entry_type = 'expire' then -new.days else 0 end,
         adjusted_days = g.adjusted_days + case when new.entry_type = 'adjust' then new.days else 0 end
   where g.leave_grant_id = new.leave_grant_id;
  return new;
end;
$$;

create trigger leave_ledger_sync_cache
  after insert on public.leave_ledger_entries
  for each row execute function app.sync_leave_grant_cache();

-- ===== 振休：付与対象（スタッフ別・期間付き。勤務制度名では判定しない） =====
create table public.staff_holiday_credit_eligibility (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff_profiles (staff_id),
  eligible    boolean not null,
  valid_from  date not null,
  valid_to    date,
  reason      text not null check (length(btrim(reason)) > 0),
  set_by      uuid,
  created_at  timestamptz not null default now(),
  constraint eligibility_period check (valid_to is null or valid_to >= valid_from),
  constraint eligibility_no_overlap exclude using gist (
    staff_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create trigger staff_holiday_credit_eligibility_forbid_delete
  before delete on public.staff_holiday_credit_eligibility
  for each row execute function app.forbid_delete();

-- ===== 振休：区分ごとのポリシー =====
create table public.holiday_credit_policies (
  credit_type         text primary key check (credit_type in ('substitute_holiday', 'compensatory_day_off', 'company_holiday_work_leave')),
  name                text not null,
  credited_days       numeric(3, 1) not null default 1 check (credited_days > 0),
  min_worked_minutes  integer not null default 1 check (min_worked_minutes >= 1),
  expiration_rule     text not null default 'end_of_month' check (expiration_rule in ('end_of_month', 'days', 'none')),
  expiration_days     integer check (expiration_days is null or expiration_days > 0),
  is_active           boolean not null default false,
  wage_note           text,
  updated_by          uuid,
  updated_at          timestamptz not null default now()
);
-- 会社独自の祝日勤務特別休暇（社内呼称「振休」）は確定ルール（A5・A6）に基づき有効化。
-- 法律上の振替休日・代休は成立条件・賃金への影響が異なるため別区分とし、設定するまで正式付与しない
insert into public.holiday_credit_policies (credit_type, name, credited_days, min_worked_minutes, expiration_rule, is_active, wage_note) values
  ('company_holiday_work_leave', '振休（祝日勤務特別休暇）', 1, 1, 'end_of_month', true,
   '会社独自の特別休暇。祝日の勤務自体の賃金（時間外・休日の割増）は勤怠計算どおり支払う'),
  ('substitute_holiday', '振替休日（法定）', 1, 1, 'none', false, '事前に休日と労働日を入れ替える制度。休日労働の割増は不要（週40時間超は時間外）'),
  ('compensatory_day_off', '代休（法定）', 1, 1, 'none', false, '休日労働の後に休ませる制度。休日労働の割増賃金は必要');

-- ===== 振休：付与申請 =====
create type public.holiday_credit_status as enum ('candidate', 'pending', 'approved', 'rejected', 'cancelled');

create table public.holiday_credit_requests (
  request_id            uuid primary key default gen_random_uuid(),
  staff_id              uuid not null references public.staff_profiles (staff_id),
  credit_type           text not null references public.holiday_credit_policies (credit_type),
  source_work_date      date not null,
  source_attendance_id  uuid not null references public.attendance_daily (attendance_id),
  source_row_version    integer not null,             -- 候補生成・報告時点の勤怠の版（後から勤怠が変わったら検出する）
  source_worked_minutes integer not null,
  home_clinic_id        uuid references public.clinics (clinic_id),
  status                public.holiday_credit_status not null default 'candidate',
  report_reason         text,                         -- 当日使用できなかった理由（院長から上長への報告）
  submitted_by          uuid,
  submitted_at          timestamptz,
  approved_by           uuid,
  approved_at           timestamptz,
  rejected_by           uuid,
  rejected_at           timestamptz,
  reject_reason         text,
  cancelled_by          uuid,
  cancelled_at          timestamptz,
  cancel_reason         text,
  created_at            timestamptz not null default now()
);
create unique index holiday_credit_requests_active_unique on public.holiday_credit_requests (source_attendance_id, credit_type)
  where status in ('candidate', 'pending', 'approved');
create index holiday_credit_requests_status_idx on public.holiday_credit_requests (status, home_clinic_id);

create trigger holiday_credit_requests_forbid_delete
  before delete on public.holiday_credit_requests
  for each row execute function app.forbid_delete();

-- ===== 振休：台帳（追記専用。付与行の期限のみ本部が変更可） =====
create type public.holiday_credit_entry_type as enum ('grant', 'use', 'use_reversal', 'expire', 'revoke', 'adjust');

create table public.holiday_credit_ledger (
  holiday_credit_id     uuid primary key default gen_random_uuid(),
  staff_id              uuid not null references public.staff_profiles (staff_id),
  entry_type            public.holiday_credit_entry_type not null,
  bucket_id             uuid references public.holiday_credit_ledger (holiday_credit_id),  -- 付与行以外：どの付与から増減したか
  request_id            uuid references public.holiday_credit_requests (request_id),
  leave_request_id      uuid references public.leave_requests (leave_request_id),
  source_work_date      date,
  source_attendance_id  uuid references public.attendance_daily (attendance_id),
  credit_type           text not null references public.holiday_credit_policies (credit_type),
  credited_days         numeric(5, 2) not null check (credited_days <> 0),
  approval_status       text,
  approved_by           uuid,
  approved_at           timestamptz,
  expiration_date       date,
  effective_date        date not null,
  reversal_of_id        uuid unique references public.holiday_credit_ledger (holiday_credit_id),
  note                  text,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  constraint holiday_credit_entry_shape check (
    (entry_type = 'grant' and credited_days > 0 and bucket_id is null and source_attendance_id is not null)
    or (entry_type = 'use' and credited_days < 0 and bucket_id is not null)
    or (entry_type = 'use_reversal' and credited_days > 0 and bucket_id is not null and reversal_of_id is not null)
    or (entry_type in ('expire', 'revoke') and credited_days < 0 and bucket_id is not null)
    or (entry_type = 'adjust' and bucket_id is not null)
  )
);
-- 同じ勤務実績への二重付与を防止
create unique index holiday_credit_ledger_one_grant on public.holiday_credit_ledger (source_attendance_id, credit_type)
  where entry_type = 'grant';
create index holiday_credit_ledger_staff_idx on public.holiday_credit_ledger (staff_id, effective_date);
create index holiday_credit_ledger_bucket_idx on public.holiday_credit_ledger (bucket_id);

create or replace function app.guard_holiday_credit_ledger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'holiday_credit_ledger は追記専用です（変更・削除はできません）' using errcode = 'P0001';
  end if;
  -- 付与行の期限だけは本部が変更できる（理由は監査ログに残す）
  if new.entry_type = 'grant'
     and (to_jsonb(new) - 'expiration_date') = (to_jsonb(old) - 'expiration_date') then
    return new;
  end if;
  raise exception 'holiday_credit_ledger は追記専用です（変更・削除はできません）' using errcode = 'P0001';
end;
$$;

create trigger holiday_credit_ledger_guard
  before update or delete on public.holiday_credit_ledger
  for each row execute function app.guard_holiday_credit_ledger();

-- ===== 権限 =====
revoke all on public.leave_policies, public.leave_grants, public.leave_requests, public.leave_ledger_entries,
  public.staff_holiday_credit_eligibility, public.holiday_credit_policies, public.holiday_credit_requests,
  public.holiday_credit_ledger
  from anon, authenticated;
grant select on public.leave_policies, public.leave_grants, public.leave_requests, public.leave_ledger_entries,
  public.staff_holiday_credit_eligibility, public.holiday_credit_policies, public.holiday_credit_requests,
  public.holiday_credit_ledger
  to authenticated;
grant update (half_day_allowed, hourly_allowed, hourly_max_days_per_year, agreement_note, updated_by) on public.leave_policies to authenticated;
grant update (min_worked_minutes, expiration_rule, expiration_days, is_active, wage_note, updated_by) on public.holiday_credit_policies to authenticated;

alter table public.leave_policies enable row level security;
alter table public.leave_grants enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_ledger_entries enable row level security;
alter table public.staff_holiday_credit_eligibility enable row level security;
alter table public.holiday_credit_policies enable row level security;
alter table public.holiday_credit_requests enable row level security;
alter table public.holiday_credit_ledger enable row level security;

create policy leave_policies_select on public.leave_policies for select to authenticated using (true);
create policy leave_policies_update on public.leave_policies for update to authenticated using (app.is_hq()) with check (app.is_hq());
create policy holiday_credit_policies_select on public.holiday_credit_policies for select to authenticated using (true);
create policy holiday_credit_policies_update on public.holiday_credit_policies for update to authenticated using (app.is_hq()) with check (app.is_hq());

-- 休暇の残数・履歴は個人情報扱い：本部、本人、主所属院の院長
create policy leave_grants_select on public.leave_grants
  for select to authenticated using (app.can_view_staff_private(staff_id));
create policy leave_ledger_select on public.leave_ledger_entries
  for select to authenticated using (app.can_view_staff_private(staff_id));
create policy holiday_credit_ledger_select on public.holiday_credit_ledger
  for select to authenticated using (app.can_view_staff_private(staff_id));
create policy eligibility_select on public.staff_holiday_credit_eligibility
  for select to authenticated using (app.can_view_staff_private(staff_id));
create policy leave_requests_select on public.leave_requests
  for select to authenticated using (
    app.can_view_staff_private(staff_id) or (home_clinic_id is not null and app.can_manage_clinic(home_clinic_id))
  );
create policy holiday_credit_requests_select on public.holiday_credit_requests
  for select to authenticated using (
    app.can_view_staff_private(staff_id) or (home_clinic_id is not null and app.can_manage_clinic(home_clinic_id))
  );

create trigger leave_policies_audit after update on public.leave_policies
  for each row execute function app.audit_row_change('leave_type');
create trigger holiday_credit_policies_audit after update on public.holiday_credit_policies
  for each row execute function app.audit_row_change('credit_type');
create trigger staff_holiday_credit_eligibility_audit after insert or update on public.staff_holiday_credit_eligibility
  for each row execute function app.audit_row_change('id');
create trigger leave_grants_audit after insert on public.leave_grants
  for each row execute function app.audit_row_change('leave_grant_id');

-- ===== 残数の計算 =====

-- 有給：付与単位ごとの残数（台帳の合計）
create or replace function app.leave_grant_remaining(p_grant_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.days), 0) from public.leave_ledger_entries e where e.leave_grant_id = p_grant_id
$$;

-- 振休：付与行ごとの残数
create or replace function app.holiday_credit_bucket_remaining(p_bucket_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.credited_days), 0)
    from public.holiday_credit_ledger l
   where l.holiday_credit_id = p_bucket_id or l.bucket_id = p_bucket_id
$$;

-- 指定日に使える残数（有効期間内の付与の合計）
create or replace function app.leave_available(p_staff_id uuid, p_type public.leave_type, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_type = 'paid' then
    return coalesce((
      select sum(app.leave_grant_remaining(g.leave_grant_id))
        from public.leave_grants g
       where g.staff_id = p_staff_id and g.grant_date <= p_on and g.expiration_date >= p_on
    ), 0);
  elsif p_type = 'holiday_credit' then
    return coalesce((
      select sum(app.holiday_credit_bucket_remaining(l.holiday_credit_id))
        from public.holiday_credit_ledger l
       where l.staff_id = p_staff_id and l.entry_type = 'grant'
         and l.source_work_date <= p_on and (l.expiration_date is null or l.expiration_date >= p_on)
    ), 0);
  end if;
  return null; -- その他休暇は残数管理なし
end;
$$;

-- 申請中（未承認）の予約日数
create or replace function app.leave_reserved(p_staff_id uuid, p_type public.leave_type)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(r.days_requested), 0)
    from public.leave_requests r
   where r.staff_id = p_staff_id and r.leave_type = p_type and r.status in ('pending', 'manager_approved')
$$;

-- 画面用：残数・予約・使用可能（本部、本人、主所属院の院長）
create or replace function public.leave_balances(p_staff_id uuid, p_on date default null)
returns table (leave_type public.leave_type, balance numeric, reserved numeric, available numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := coalesce(p_on, app.today_jst());
begin
  if not app.can_view_staff_private(p_staff_id) then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  return query
    select t.lt, app.leave_available(p_staff_id, t.lt, d), app.leave_reserved(p_staff_id, t.lt),
           app.leave_available(p_staff_id, t.lt, d) - app.leave_reserved(p_staff_id, t.lt)
      from (values ('paid'::public.leave_type), ('holiday_credit'::public.leave_type)) as t (lt);
end;
$$;

-- 台帳とキャッシュの整合性チェック（不一致の付与単位を返す）
create or replace function public.check_leave_ledger_consistency()
returns table (leave_grant_id uuid, staff_id uuid, cached_remaining numeric, ledger_remaining numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_hq() and auth.uid() is not null then
    raise exception '本部のみ実行できます' using errcode = '42501';
  end if;
  return query
    select g.leave_grant_id, g.staff_id,
           g.granted_days + g.adjusted_days - g.used_days - g.expired_days,
           app.leave_grant_remaining(g.leave_grant_id)
      from public.leave_grants g
     where g.granted_days + g.adjusted_days - g.used_days - g.expired_days <> app.leave_grant_remaining(g.leave_grant_id);
end;
$$;

-- ===== 有給の付与・調整・失効（本部のみ） =====

create or replace function public.grant_paid_leave(
  p_staff_id uuid,
  p_grant_date date,
  p_days numeric,
  p_grant_type public.leave_grant_type,
  p_expiration_date date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_exp date := coalesce(p_expiration_date, (p_grant_date + interval '2 years')::date - 1);  -- 時効2年
begin
  if not app.is_hq() then
    raise exception '有給休暇の付与は本部のみ可能です' using errcode = '42501';
  end if;
  if p_days is null or p_days <= 0 or p_days > 40 or (p_days * 2) <> floor(p_days * 2) then
    raise exception '付与日数は0.5日単位で入力してください' using errcode = '22023';
  end if;
  if exists (select 1 from public.leave_grants g where g.staff_id = p_staff_id and g.grant_date = p_grant_date and g.grant_type = p_grant_type) then
    raise exception '%の同じ種類の付与は登録済みです', p_grant_date using errcode = '23505';
  end if;

  insert into public.leave_grants (staff_id, grant_date, granted_days, expiration_date, grant_type, annual_5day_target, note, created_by)
  values (p_staff_id, p_grant_date, p_days, v_exp, p_grant_type, p_days >= 10 and p_grant_type <> 'migration', p_note, auth.uid())
  returning leave_grant_id into v_id;
  insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
  values (p_staff_id, v_id, 'grant', p_days, p_grant_date, p_note, auth.uid());

  if p_grant_date < app.today_jst() then
    insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id, after, reason, is_backdated)
    values (auth.uid(), 'user', 'backdated_grant', 'leave_grants', v_id::text,
            jsonb_build_object('grant_date', p_grant_date, 'days', p_days), p_note, true);
  end if;
  return v_id;
end;
$$;

-- 残数の調整（移行時の訂正など）。理由必須・過去日付は監査ログに明示
create or replace function public.adjust_paid_leave(p_grant_id uuid, p_days numeric, p_effective_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.leave_grants;
begin
  if not app.is_hq() then
    raise exception '有給休暇の調整は本部のみ可能です' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '調整の理由を入力してください' using errcode = '22023';
  end if;
  select * into g from public.leave_grants where leave_grant_id = p_grant_id for update;
  if g.leave_grant_id is null then
    raise exception '付与が見つかりません' using errcode = 'P0002';
  end if;
  if app.leave_grant_remaining(p_grant_id) + p_days < 0 then
    raise exception '調整後の残数がマイナスになります' using errcode = '22023';
  end if;
  insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
  values (g.staff_id, p_grant_id, 'adjust', p_days, p_effective_date, btrim(p_reason), auth.uid());
  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id, after, reason, is_backdated)
  values (auth.uid(), 'user', 'adjust', 'leave_grants', p_grant_id::text, jsonb_build_object('days', p_days, 'effective_date', p_effective_date),
          btrim(p_reason), p_effective_date < app.today_jst());
end;
$$;

-- 期限切れの有給を失効させる（本部が実行）。失効した日数を返す
create or replace function public.expire_paid_leave(p_as_of date default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := coalesce(p_as_of, app.today_jst());
  g record;
  total numeric := 0;
begin
  if not app.is_hq() then
    raise exception '失効処理は本部のみ可能です' using errcode = '42501';
  end if;
  for g in
    select lg.leave_grant_id, lg.staff_id, lg.expiration_date, app.leave_grant_remaining(lg.leave_grant_id) as remaining
      from public.leave_grants lg
     where lg.expiration_date < d
     for update
  loop
    continue when g.remaining <= 0;
    insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
    values (g.staff_id, g.leave_grant_id, 'expire', -g.remaining, g.expiration_date + 1, '時効による失効', auth.uid());
    total := total + g.remaining;
  end loop;
  return total;
end;
$$;

-- 年5日取得義務：10日以上付与された日から1年間の取得日数
create or replace function public.annual_leave_obligations(p_as_of date default null)
returns table (staff_id uuid, leave_grant_id uuid, grant_date date, period_end date, taken_days numeric, shortfall numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := coalesce(p_as_of, app.today_jst());
begin
  return query
    select g.staff_id, g.leave_grant_id, g.grant_date, (g.grant_date + interval '1 year')::date - 1,
           coalesce((
             select -sum(e.days) from public.leave_ledger_entries e
              where e.staff_id = g.staff_id and e.entry_type in ('use', 'use_reversal')
                and e.effective_date between g.grant_date and (g.grant_date + interval '1 year')::date - 1
           ), 0) as taken,
           greatest(0, 5 - coalesce((
             select -sum(e.days) from public.leave_ledger_entries e
              where e.staff_id = g.staff_id and e.entry_type in ('use', 'use_reversal')
                and e.effective_date between g.grant_date and (g.grant_date + interval '1 year')::date - 1
           ), 0))
      from public.leave_grants g
     where g.annual_5day_target
       and g.grant_date <= d and (g.grant_date + interval '1 year')::date - 1 >= d
       and app.can_view_staff_private(g.staff_id);
end;
$$;

-- ===== 休暇申請 =====

-- 1日あたりの消化日数
create or replace function app.leave_day_amount(p_unit public.leave_unit, p_minutes integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_unit when 'full' then 1 when 'am' then 0.5 when 'pm' then 0.5 else round(p_minutes / 480.0, 3) end
$$;

-- 申請の作成（端末・本人・院長の代理申請で共通）。残数（予約を含む）と重複を確認する
create or replace function app.create_leave_request(
  p_staff_id uuid,
  p_type public.leave_type,
  p_start date,
  p_end date,
  p_unit public.leave_unit,
  p_minutes integer,
  p_note text,
  p_via text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy public.leave_policies;
  contract public.employment_contracts;
  v_days numeric;
  v_available numeric;
  v_home uuid := app.staff_primary_clinic_id(p_staff_id, p_start);
  v_id uuid;
  v_end date := coalesce(p_end, p_start);
begin
  -- スタッフ単位で直列化し、同時申請による残数の二重使用を防ぐ
  perform 1 from public.staff_profiles where staff_id = p_staff_id for update;

  select * into policy from public.leave_policies where leave_type = p_type;
  if p_unit in ('am', 'pm') and not policy.half_day_allowed then
    raise exception '半日単位の申請はできません' using errcode = '22023';
  end if;
  if p_unit = 'hour' then
    select * into contract from public.employment_contracts c
     where c.staff_id = p_staff_id and app.in_period(c.valid_from, c.valid_to, p_start);
    if p_type <> 'paid' or not policy.hourly_allowed or not coalesce(contract.hourly_leave_enabled, false) then
      raise exception '時間単位の有給休暇は、労使協定の設定がある場合のみ申請できます' using errcode = '22023';
    end if;
  end if;
  if p_unit <> 'full' and v_end <> p_start then
    raise exception '半日・時間単位は1日ずつ申請してください' using errcode = '22023';
  end if;
  if v_end < p_start or v_end - p_start > 30 then
    raise exception '期間は31日以内で指定してください' using errcode = '22023';
  end if;
  if v_home is not null and (app.is_month_closed(v_home, p_start) or app.is_month_closed(v_home, v_end)) then
    raise exception '締め済みの月の休暇は申請できません' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.leave_requests r
     where r.staff_id = p_staff_id and r.status in ('pending', 'manager_approved', 'approved')
       and daterange(r.start_date, r.end_date, '[]') && daterange(p_start, v_end, '[]')
       and (r.unit = 'full' or p_unit = 'full' or r.unit = p_unit)
  ) then
    raise exception '同じ日に休暇の申請が既にあります' using errcode = '23505';
  end if;

  v_days := app.leave_day_amount(p_unit, p_minutes) * (v_end - p_start + 1);
  if p_type <> 'other' then
    v_available := app.leave_available(p_staff_id, p_type, p_start) - app.leave_reserved(p_staff_id, p_type);
    if v_days > v_available then
      raise exception '残数が不足しています（申請 % 日／使用可能 % 日。申請中の分を含みます）', v_days, greatest(v_available, 0)
        using errcode = '22023';
    end if;
  end if;

  insert into public.leave_requests (staff_id, home_clinic_id, leave_type, start_date, end_date, unit, minutes, days_requested,
                                     note, requested_via, requested_by)
  values (p_staff_id, v_home, p_type, p_start, v_end, p_unit, case when p_unit = 'hour' then p_minutes end, v_days,
          nullif(btrim(coalesce(p_note, '')), ''), p_via, p_requested_by)
  returning leave_request_id into v_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('leave_requests', v_id, v_home, 'manager', 'request', p_requested_by, p_note);
  return v_id;
end;
$$;

-- 院長・本部による代理申請、または本人（個人アカウント）の申請
create or replace function public.request_leave(
  p_staff_id uuid,
  p_type public.leave_type,
  p_start date,
  p_end date,
  p_unit public.leave_unit default 'full',
  p_minutes integer default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  home uuid := app.staff_primary_clinic_id(p_staff_id, p_start);
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  if not (app.is_hq() or p_staff_id = app.current_staff_id() or home = any (app.managed_clinic_ids())) then
    raise exception 'このスタッフの休暇は申請できません' using errcode = '42501';
  end if;
  return app.create_leave_request(p_staff_id, p_type, p_start, p_end, p_unit, p_minutes, p_note,
    case when p_staff_id = app.current_staff_id() then 'web' else 'proxy' end, auth.uid());
end;
$$;

-- 共用端末からの申請（本人確認済みの一回限りトークンを消費）
create or replace function public.kiosk_request_leave(
  p_secret text,
  p_session_token text,
  p_type text,
  p_start date,
  p_end date,
  p_unit text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices := app.kiosk_device_by_secret(p_secret);
  sess public.kiosk_sessions;
  v_id uuid;
begin
  if device.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'device_invalid');
  end if;
  select * into sess from public.kiosk_sessions
   where token_hash = app.sha256_hex(coalesce(p_session_token, '')) and device_id = device.device_id
   for update;
  if sess.session_id is null or sess.consumed_at is not null or sess.created_at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'error', 'session_invalid');
  end if;
  if p_type not in ('paid', 'holiday_credit', 'other') or p_unit not in ('full', 'am', 'pm') then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  begin
    v_id := app.create_leave_request(sess.staff_id, p_type::public.leave_type, p_start, p_end, p_unit::public.leave_unit,
                                     null, p_note, 'kiosk', null);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'rejected', 'message', sqlerrm);
  end;
  update public.kiosk_sessions set consumed_at = now() where session_id = sess.session_id;
  return jsonb_build_object('ok', true, 'request_id', v_id);
end;
$$;

-- 共用端末：申請画面に表示する残数（トークンは消費しない）
create or replace function public.kiosk_leave_balances(p_secret text, p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices := app.kiosk_device_by_secret(p_secret);
  sess public.kiosk_sessions;
  d date := app.today_jst();
begin
  if device.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'device_invalid');
  end if;
  select * into sess from public.kiosk_sessions
   where token_hash = app.sha256_hex(coalesce(p_session_token, '')) and device_id = device.device_id;
  if sess.session_id is null or sess.consumed_at is not null or sess.created_at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'error', 'session_invalid');
  end if;
  return jsonb_build_object(
    'ok', true,
    'paid', app.leave_available(sess.staff_id, 'paid', d) - app.leave_reserved(sess.staff_id, 'paid'),
    'holiday_credit', app.leave_available(sess.staff_id, 'holiday_credit', d) - app.leave_reserved(sess.staff_id, 'holiday_credit'),
    'half_day', (select coalesce(bool_and(half_day_allowed), false) from public.leave_policies)
  );
end;
$$;

-- 院長の一次承認（本部が代行することもできる）
create or replace function public.approve_leave_manager(p_request_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.leave_requests;
begin
  select * into r from public.leave_requests where leave_request_id = p_request_id for update;
  if r.leave_request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if not (app.is_hq() or r.home_clinic_id = any (app.managed_clinic_ids())) then
    raise exception 'この申請を承認する権限がありません' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'この申請は既に処理済みです' using errcode = '22023';
  end if;
  update public.leave_requests set status = 'manager_approved', manager_approved_by = auth.uid(), manager_approved_at = now()
   where leave_request_id = r.leave_request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('leave_requests', r.leave_request_id, r.home_clinic_id, 'manager', 'approve', auth.uid(), p_comment);
end;
$$;

-- 休暇をシフトに反映（全日休暇のみ。勤務シフトは取り消し、休暇シフトを確定で登録）
create or replace function app.apply_leave_to_shifts(r public.leave_requests)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date;
  s public.shifts;
  saved public.shifts;
  v_type public.shift_type := case r.leave_type when 'paid' then 'paid_leave' when 'holiday_credit' then 'holiday_credit_leave' else 'other_leave' end;
  v_clinic uuid;
  applied uuid[] := '{}';
  reason text := '休暇承認による反映';
begin
  if r.unit <> 'full' then
    return applied;
  end if;
  for d in select generate_series(r.start_date, r.end_date, interval '1 day')::date loop
    v_clinic := coalesce(app.staff_primary_clinic_id(r.staff_id, d), r.home_clinic_id);
    for s in select * from public.shifts where staff_id = r.staff_id and work_date = d and shift_type = 'work' and status <> 'cancelled' for update loop
      update public.shifts set status = 'cancelled', version = s.version + 1 where shift_id = s.shift_id returning * into saved;
      insert into public.shift_revision_logs (shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after, reason, requires_recalc, changed_by)
      values (s.shift_id, s.clinic_id, s.staff_id, d, 'cancel', s.version, saved.version, app.shift_snapshot(s), app.shift_snapshot(saved), reason, d <= app.today_jst(), auth.uid());
    end loop;
    select * into s from public.shifts where staff_id = r.staff_id and work_date = d and shift_type <> 'work' and status <> 'cancelled' for update;
    if s.shift_id is not null then
      update public.shifts
         set shift_type = v_type, status = 'confirmed', version = s.version + 1, confirmed_by = auth.uid(), confirmed_at = now()
       where shift_id = s.shift_id returning * into saved;
      insert into public.shift_revision_logs (shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after, reason, requires_recalc, changed_by)
      values (s.shift_id, s.clinic_id, s.staff_id, d, 'update', s.version, saved.version, app.shift_snapshot(s), app.shift_snapshot(saved), reason, d <= app.today_jst(), auth.uid());
    else
      insert into public.shifts (staff_id, clinic_id, work_date, shift_type, status, created_by, confirmed_by, confirmed_at, note)
      values (r.staff_id, v_clinic, d, v_type, 'confirmed', auth.uid(), auth.uid(), now(), '休暇承認により登録')
      returning * into saved;
      insert into public.shift_revision_logs (shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after, reason, requires_recalc, changed_by)
      values (saved.shift_id, saved.clinic_id, r.staff_id, d, 'create', null, saved.version, null, app.shift_snapshot(saved), reason, d <= app.today_jst(), auth.uid());
    end if;
    applied := applied || saved.shift_id;
  end loop;
  return applied;
end;
$$;

-- 本部の最終承認：台帳に使用を記録（期限の近い付与から消化）し、シフトに反映する（単一トランザクション）
create or replace function public.approve_leave_final(p_request_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.leave_requests;
  d date;
  per_day numeric;
  need numeric;
  take numeric;
  g record;
  b record;
begin
  if not app.is_hq() then
    raise exception '休暇の最終承認は本部のみ可能です' using errcode = '42501';
  end if;
  select * into r from public.leave_requests where leave_request_id = p_request_id for update;
  if r.leave_request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if r.status <> 'manager_approved' then
    raise exception 'この申請は院長の一次承認前か、既に処理済みです' using errcode = '22023';
  end if;
  perform 1 from public.staff_profiles where staff_id = r.staff_id for update;
  per_day := app.leave_day_amount(r.unit, r.minutes);

  for d in select generate_series(r.start_date, r.end_date, interval '1 day')::date loop
    need := per_day;
    if r.leave_type = 'paid' then
      for g in
        select lg.leave_grant_id, app.leave_grant_remaining(lg.leave_grant_id) as remaining
          from public.leave_grants lg
         where lg.staff_id = r.staff_id and lg.grant_date <= d and lg.expiration_date >= d
         order by lg.expiration_date, lg.grant_date
         for update
      loop
        exit when need <= 0;
        continue when g.remaining <= 0;
        take := least(need, g.remaining);
        insert into public.leave_ledger_entries (staff_id, leave_grant_id, leave_request_id, entry_type, days, effective_date, created_by)
        values (r.staff_id, g.leave_grant_id, r.leave_request_id, 'use', -take, d, auth.uid());
        need := need - take;
      end loop;
    elsif r.leave_type = 'holiday_credit' then
      for b in
        select l.holiday_credit_id, l.credit_type, app.holiday_credit_bucket_remaining(l.holiday_credit_id) as remaining
          from public.holiday_credit_ledger l
         where l.staff_id = r.staff_id and l.entry_type = 'grant'
           and l.source_work_date <= d and (l.expiration_date is null or l.expiration_date >= d)
         order by l.expiration_date nulls last, l.source_work_date
      loop
        exit when need <= 0;
        continue when b.remaining <= 0;
        take := least(need, b.remaining);
        insert into public.holiday_credit_ledger (staff_id, entry_type, bucket_id, leave_request_id, credit_type, credited_days, effective_date, created_by)
        values (r.staff_id, 'use', b.holiday_credit_id, r.leave_request_id, b.credit_type, -take, d, auth.uid());
        need := need - take;
      end loop;
    else
      need := 0;
    end if;
    if need > 0 then
      raise exception '%の時点で使用できる残数が不足しています（期限切れの可能性があります）', d using errcode = '22023';
    end if;
  end loop;

  update public.leave_requests
     set status = 'approved', hq_approved_by = auth.uid(), hq_approved_at = now(), applied_shift_ids = app.apply_leave_to_shifts(r)
   where leave_request_id = r.leave_request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('leave_requests', r.leave_request_id, r.home_clinic_id, 'hq', 'approve', auth.uid(), p_comment);
end;
$$;

create or replace function public.reject_leave(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.leave_requests;
begin
  select * into r from public.leave_requests where leave_request_id = p_request_id for update;
  if r.leave_request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if not (app.is_hq() or r.home_clinic_id = any (app.managed_clinic_ids())) then
    raise exception 'この申請を却下する権限がありません' using errcode = '42501';
  end if;
  if r.status not in ('pending', 'manager_approved') then
    raise exception 'この申請は既に処理済みです' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '却下の理由を入力してください' using errcode = '22023';
  end if;
  update public.leave_requests set status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), reject_reason = btrim(p_reason)
   where leave_request_id = r.leave_request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('leave_requests', r.leave_request_id, r.home_clinic_id, case when app.is_hq() then 'hq' else 'manager' end, 'reject', auth.uid(), btrim(p_reason));
end;
$$;

-- 取消。承認前は院長・本部、承認後は本部のみ。承認後の取消は使用の戻し（1回限り）とシフトの取消を行う
create or replace function public.cancel_leave(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.leave_requests;
  e record;
  s public.shifts;
  saved public.shifts;
begin
  select * into r from public.leave_requests where leave_request_id = p_request_id for update;
  if r.leave_request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '取消の理由を入力してください' using errcode = '22023';
  end if;
  if r.status in ('rejected', 'cancelled') then
    raise exception 'この申請は既に取消・却下されています' using errcode = '22023';
  end if;
  if r.status = 'approved' then
    if not app.is_hq() then
      raise exception '承認済みの休暇の取消は本部のみ可能です' using errcode = '42501';
    end if;
    if r.home_clinic_id is not null and (app.is_month_closed(r.home_clinic_id, r.start_date) or app.is_month_closed(r.home_clinic_id, r.end_date)) then
      raise exception '締め済みの月の休暇は取り消せません（本部による締めの再開が必要です）' using errcode = 'P0001';
    end if;
    -- 使用の戻し（reversal_of_entry_id の一意制約で二重返還を防ぐ）
    for e in select * from public.leave_ledger_entries where leave_request_id = r.leave_request_id and entry_type = 'use' loop
      insert into public.leave_ledger_entries (staff_id, leave_grant_id, leave_request_id, entry_type, days, effective_date, reversal_of_entry_id, note, created_by)
      values (e.staff_id, e.leave_grant_id, r.leave_request_id, 'use_reversal', -e.days, e.effective_date, e.entry_id, btrim(p_reason), auth.uid());
    end loop;
    for e in select * from public.holiday_credit_ledger where leave_request_id = r.leave_request_id and entry_type = 'use' loop
      insert into public.holiday_credit_ledger (staff_id, entry_type, bucket_id, leave_request_id, credit_type, credited_days, effective_date, reversal_of_id, note, created_by)
      values (e.staff_id, 'use_reversal', e.bucket_id, r.leave_request_id, e.credit_type, -e.credited_days, e.effective_date, e.holiday_credit_id, btrim(p_reason), auth.uid());
    end loop;
    -- 反映した休暇シフトを取り消す（元の勤務シフトは院長が組み直す）
    for s in select * from public.shifts where shift_id = any (r.applied_shift_ids) and status <> 'cancelled' for update loop
      update public.shifts set status = 'cancelled', version = s.version + 1 where shift_id = s.shift_id returning * into saved;
      insert into public.shift_revision_logs (shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after, reason, requires_recalc, changed_by)
      values (s.shift_id, s.clinic_id, s.staff_id, s.work_date, 'cancel', s.version, saved.version, app.shift_snapshot(s), app.shift_snapshot(saved),
              '休暇取消による取消', s.work_date <= app.today_jst(), auth.uid());
    end loop;
  elsif not (app.is_hq() or r.home_clinic_id = any (app.managed_clinic_ids()) or r.staff_id = app.current_staff_id()) then
    raise exception 'この申請を取り消す権限がありません' using errcode = '42501';
  end if;

  update public.leave_requests set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = btrim(p_reason)
   where leave_request_id = r.leave_request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('leave_requests', r.leave_request_id, r.home_clinic_id, case when app.is_hq() then 'hq' else 'manager' end, 'cancel', auth.uid(), btrim(p_reason));
end;
$$;

-- ===== 振休 =====

-- 付与対象の設定（本部のみ）。新しい開始日で登録すると、それまでの設定を前日で終了する
create or replace function public.set_holiday_credit_eligibility(p_staff_id uuid, p_eligible boolean, p_valid_from date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception '振休の付与対象の設定は本部のみ可能です' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '理由を入力してください' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff_holiday_credit_eligibility where staff_id = p_staff_id and valid_from >= p_valid_from) then
    raise exception '%以降に開始する設定が既にあります', p_valid_from using errcode = '22023';
  end if;
  update public.staff_holiday_credit_eligibility
     set valid_to = p_valid_from - 1
   where staff_id = p_staff_id and (valid_to is null or valid_to >= p_valid_from);
  insert into public.staff_holiday_credit_eligibility (staff_id, eligible, valid_from, reason, set_by)
  values (p_staff_id, p_eligible, p_valid_from, btrim(p_reason), auth.uid());
end;
$$;

create or replace function app.holiday_credit_eligible(p_staff_id uuid, p_on date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.eligible from public.staff_holiday_credit_eligibility e
     where e.staff_id = p_staff_id and app.in_period(e.valid_from, e.valid_to, p_on)
  ), false)
$$;

/*
 * 付与候補の生成。条件：
 *   付与対象スタッフ／会社カレンダーの対象祝日／実労働あり（ポリシーの最低時間以上）／院長確認済み以上／未付与
 * 候補は残数に加算しない。p_clinic_id が NULL の場合は全院（本部のみ）
 */
create or replace function public.generate_holiday_credit_candidates(p_clinic_id uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy public.holiday_credit_policies;
  a record;
  n integer := 0;
begin
  if p_clinic_id is null and not app.is_hq() then
    raise exception '全院の候補生成は本部のみ可能です' using errcode = '42501';
  end if;
  if p_clinic_id is not null and not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院の候補は生成できません' using errcode = '42501';
  end if;
  select * into policy from public.holiday_credit_policies where credit_type = 'company_holiday_work_leave';

  for a in
    select d.attendance_id, d.staff_id, d.work_date, d.row_version, d.worked_minutes, d.home_clinic_id
      from public.attendance_daily d
      join public.company_holidays h on h.holiday_date = d.work_date and h.credit_target
     where d.work_date between p_from and p_to
       and (p_clinic_id is null or d.home_clinic_id = p_clinic_id)
       and d.status in ('manager_confirmed', 'closed')
       and d.worked_minutes >= policy.min_worked_minutes
       and app.holiday_credit_eligible(d.staff_id, d.work_date)
       and not exists (
         select 1 from public.holiday_credit_requests r
          where r.source_attendance_id = d.attendance_id and r.credit_type = policy.credit_type
            and r.status in ('candidate', 'pending', 'approved')
       )
  loop
    insert into public.holiday_credit_requests (staff_id, credit_type, source_work_date, source_attendance_id, source_row_version,
                                                source_worked_minutes, home_clinic_id)
    values (a.staff_id, policy.credit_type, a.work_date, a.attendance_id, a.row_version, a.worked_minutes, a.home_clinic_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 院長の報告（当日使用できなかった理由）→ 承認待ち
create or replace function public.submit_holiday_credit(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.holiday_credit_requests;
  att public.attendance_daily;
begin
  select * into r from public.holiday_credit_requests where request_id = p_request_id for update;
  if r.request_id is null then
    raise exception '候補が見つかりません' using errcode = 'P0002';
  end if;
  if not (app.is_hq() or r.home_clinic_id = any (app.managed_clinic_ids())) then
    raise exception 'この候補を報告する権限がありません' using errcode = '42501';
  end if;
  if r.status <> 'candidate' then
    raise exception 'この候補は既に報告・処理済みです' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '当日使用できなかった理由を入力してください' using errcode = '22023';
  end if;
  select * into att from public.attendance_daily where attendance_id = r.source_attendance_id;
  update public.holiday_credit_requests
     set status = 'pending', report_reason = btrim(p_reason), submitted_by = auth.uid(), submitted_at = now(),
         source_row_version = att.row_version, source_worked_minutes = att.worked_minutes
   where request_id = r.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('holiday_credit_requests', r.request_id, r.home_clinic_id, 'manager', 'request', auth.uid(), btrim(p_reason));
end;
$$;

-- 本部承認：状態の更新と台帳への1日加算を単一トランザクションで行う。二重付与は一意制約でも防ぐ
create or replace function public.approve_holiday_credit(p_request_id uuid, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.holiday_credit_requests;
  policy public.holiday_credit_policies;
  att public.attendance_daily;
  v_exp date;
  v_id uuid;
begin
  if not app.is_hq() then
    raise exception '振休の付与承認は本部のみ可能です' using errcode = '42501';
  end if;
  select * into r from public.holiday_credit_requests where request_id = p_request_id for update;
  if r.request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'この申請は承認待ちではありません（既に処理済みの可能性があります）' using errcode = '22023';
  end if;
  select * into policy from public.holiday_credit_policies where credit_type = r.credit_type;
  if not policy.is_active then
    raise exception '「%」は付与条件・期限が設定されていないため、正式付与できません', policy.name using errcode = '22023';
  end if;
  select * into att from public.attendance_daily where attendance_id = r.source_attendance_id;
  if att.worked_minutes < policy.min_worked_minutes or att.row_version <> r.source_row_version then
    raise exception '報告後に勤怠実績が変更されています。勤怠を確認してから再度報告してください' using errcode = '22023';
  end if;

  v_exp := case policy.expiration_rule
             when 'end_of_month' then (date_trunc('month', r.source_work_date) + interval '1 month - 1 day')::date
             when 'days' then r.source_work_date + policy.expiration_days
             else null end;

  insert into public.holiday_credit_ledger (staff_id, entry_type, request_id, source_work_date, source_attendance_id, credit_type,
                                            credited_days, approval_status, approved_by, approved_at, expiration_date, effective_date, created_by)
  values (r.staff_id, 'grant', r.request_id, r.source_work_date, r.source_attendance_id, r.credit_type,
          policy.credited_days, 'approved', auth.uid(), now(), v_exp, r.source_work_date, auth.uid())
  returning holiday_credit_id into v_id;

  update public.holiday_credit_requests set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where request_id = r.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('holiday_credit_requests', r.request_id, r.home_clinic_id, 'hq', 'approve', auth.uid(), p_comment);
  return v_id;
end;
$$;

create or replace function public.reject_holiday_credit(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.holiday_credit_requests;
begin
  select * into r from public.holiday_credit_requests where request_id = p_request_id for update;
  if r.request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if not (app.is_hq() or (r.status = 'candidate' and r.home_clinic_id = any (app.managed_clinic_ids()))) then
    raise exception 'この申請を却下する権限がありません' using errcode = '42501';
  end if;
  if r.status not in ('candidate', 'pending') then
    raise exception 'この申請は既に処理済みです' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '理由を入力してください' using errcode = '22023';
  end if;
  update public.holiday_credit_requests
     set status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), reject_reason = btrim(p_reason)
   where request_id = r.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('holiday_credit_requests', r.request_id, r.home_clinic_id, case when app.is_hq() then 'hq' else 'manager' end, 'reject', auth.uid(), btrim(p_reason));
end;
$$;

-- 付与の取消（本部のみ）。履歴を残して取消エントリを追記する。使用済みの場合は残数がマイナスになる
create or replace function public.revoke_holiday_credit(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.holiday_credit_requests;
  g public.holiday_credit_ledger;
begin
  if not app.is_hq() then
    raise exception '付与の取消は本部のみ可能です' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '取消の理由を入力してください' using errcode = '22023';
  end if;
  select * into r from public.holiday_credit_requests where request_id = p_request_id for update;
  if r.status <> 'approved' then
    raise exception '承認済みの付与ではありません' using errcode = '22023';
  end if;
  select * into g from public.holiday_credit_ledger where request_id = r.request_id and entry_type = 'grant';
  if exists (select 1 from public.holiday_credit_ledger where bucket_id = g.holiday_credit_id and entry_type = 'revoke') then
    raise exception 'この付与は既に取り消されています' using errcode = '22023';
  end if;
  insert into public.holiday_credit_ledger (staff_id, entry_type, bucket_id, request_id, credit_type, credited_days, effective_date, note, created_by)
  values (g.staff_id, 'revoke', g.holiday_credit_id, r.request_id, g.credit_type, -g.credited_days, app.today_jst(), btrim(p_reason), auth.uid());
  update public.holiday_credit_requests set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = btrim(p_reason)
   where request_id = r.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('holiday_credit_requests', r.request_id, r.home_clinic_id, 'hq', 'cancel', auth.uid(), btrim(p_reason));
end;
$$;

-- 期限の変更（本部のみ・理由必須）
create or replace function public.set_holiday_credit_expiration(p_holiday_credit_id uuid, p_expiration_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.holiday_credit_ledger;
begin
  if not app.is_hq() then
    raise exception '期限の変更は本部のみ可能です' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '期限を変更する理由を入力してください' using errcode = '22023';
  end if;
  select * into g from public.holiday_credit_ledger where holiday_credit_id = p_holiday_credit_id and entry_type = 'grant' for update;
  if g.holiday_credit_id is null then
    raise exception '付与が見つかりません' using errcode = 'P0002';
  end if;
  if p_expiration_date is not null and p_expiration_date < g.source_work_date then
    raise exception '期限は祝日勤務日より後にしてください' using errcode = '22023';
  end if;
  update public.holiday_credit_ledger set expiration_date = p_expiration_date where holiday_credit_id = g.holiday_credit_id;
  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id, before, after, reason)
  values (auth.uid(), 'user', 'change_expiration', 'holiday_credit_ledger', g.holiday_credit_id::text,
          jsonb_build_object('expiration_date', g.expiration_date), jsonb_build_object('expiration_date', p_expiration_date), btrim(p_reason));
end;
$$;

-- 期限切れの振休を失効させる（自動では失効させず、本部が確定する）。p_ids を指定するとその付与だけ
create or replace function public.expire_holiday_credits(p_as_of date default null, p_ids uuid[] default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := coalesce(p_as_of, app.today_jst());
  b record;
  total numeric := 0;
begin
  if not app.is_hq() then
    raise exception '失効処理は本部のみ可能です' using errcode = '42501';
  end if;
  for b in
    select l.holiday_credit_id, l.staff_id, l.credit_type, l.expiration_date, app.holiday_credit_bucket_remaining(l.holiday_credit_id) as remaining
      from public.holiday_credit_ledger l
     where l.entry_type = 'grant' and l.expiration_date < d and (p_ids is null or l.holiday_credit_id = any (p_ids))
  loop
    continue when b.remaining <= 0;
    insert into public.holiday_credit_ledger (staff_id, entry_type, bucket_id, credit_type, credited_days, effective_date, note, created_by)
    values (b.staff_id, 'expire', b.holiday_credit_id, b.credit_type, -b.remaining, b.expiration_date + 1, '期限切れによる失効', auth.uid());
    total := total + b.remaining;
  end loop;
  return total;
end;
$$;

-- 付与台帳と勤怠実績の不整合を検出する（勤怠の修正・取消後に、付与の根拠がなくなったもの）
create or replace function public.holiday_credit_inconsistencies(p_clinic_id uuid default null)
returns table (request_id uuid, staff_id uuid, source_work_date date, issue text, granted_row_version integer, current_row_version integer,
               current_worked_minutes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_clinic_id is null and not app.is_hq() then
    raise exception '全院の確認は本部のみ可能です' using errcode = '42501';
  end if;
  if p_clinic_id is not null and not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院は確認できません' using errcode = '42501';
  end if;
  return query
    select r.request_id, r.staff_id, r.source_work_date,
           case
             when d.worked_minutes < p.min_worked_minutes then 'no_work'
             when not exists (select 1 from public.company_holidays h where h.holiday_date = r.source_work_date and h.credit_target) then 'not_holiday'
             when not app.holiday_credit_eligible(r.staff_id, r.source_work_date) then 'not_eligible'
             else 'attendance_changed'
           end,
           r.source_row_version, d.row_version, d.worked_minutes
      from public.holiday_credit_requests r
      join public.attendance_daily d on d.attendance_id = r.source_attendance_id
      join public.holiday_credit_policies p on p.credit_type = r.credit_type
     where r.status = 'approved'
       and (p_clinic_id is null or r.home_clinic_id = p_clinic_id)
       and (d.row_version <> r.source_row_version
            or d.worked_minutes < p.min_worked_minutes
            or not exists (select 1 from public.company_holidays h where h.holiday_date = r.source_work_date and h.credit_target)
            or not app.holiday_credit_eligible(r.staff_id, r.source_work_date));
end;
$$;

-- ===== 実行権限 =====
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function app.recalc_attendance(uuid, date, date) from authenticated;
revoke execute on function app.kiosk_device_by_secret(text) from authenticated;
revoke execute on function app.random_token() from authenticated;
revoke execute on function app.create_leave_request(uuid, public.leave_type, date, date, public.leave_unit, integer, text, text, uuid) from authenticated;
revoke execute on function app.apply_leave_to_shifts(public.leave_requests) from authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.leave_balances(uuid, date)',
    'public.check_leave_ledger_consistency()',
    'public.grant_paid_leave(uuid, date, numeric, public.leave_grant_type, date, text)',
    'public.adjust_paid_leave(uuid, numeric, date, text)',
    'public.expire_paid_leave(date)',
    'public.annual_leave_obligations(date)',
    'public.request_leave(uuid, public.leave_type, date, date, public.leave_unit, integer, text)',
    'public.approve_leave_manager(uuid, text)',
    'public.approve_leave_final(uuid, text)',
    'public.reject_leave(uuid, text)',
    'public.cancel_leave(uuid, text)',
    'public.set_holiday_credit_eligibility(uuid, boolean, date, text)',
    'public.generate_holiday_credit_candidates(uuid, date, date)',
    'public.submit_holiday_credit(uuid, text)',
    'public.approve_holiday_credit(uuid, text)',
    'public.reject_holiday_credit(uuid, text)',
    'public.revoke_holiday_credit(uuid, text)',
    'public.set_holiday_credit_expiration(uuid, date, text)',
    'public.expire_holiday_credits(date, uuid[])',
    'public.holiday_credit_inconsistencies(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

revoke all on function public.kiosk_request_leave(text, text, text, date, date, text, text) from public;
revoke all on function public.kiosk_leave_balances(text, text) from public;
grant execute on function public.kiosk_request_leave(text, text, text, date, date, text, text) to anon, authenticated;
grant execute on function public.kiosk_leave_balances(text, text) to anon, authenticated;
