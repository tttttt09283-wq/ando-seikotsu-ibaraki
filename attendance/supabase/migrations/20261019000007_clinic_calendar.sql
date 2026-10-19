-- 0007: 院ごとの診療時間・休診日、会社カレンダー（祝日）、勤務条件（所定8時間・みなし残業）
--
-- 確定した業務ルール（2026-10-19）
--   - 診療時間は院ごとに異なる → clinic_business_hours（曜日別・祝日別、午前/午後など複数枠、期間で履歴化）
--   - 休日は院ごとに調整する   → 定休日＝その曜日に枠が無いこと。臨時休診・特別診療は clinic_calendar_exceptions
--   - 所定労働時間は1日8時間   → employment_contracts.daily_scheduled_minutes の既定値を 480 に
--   - みなし残業（固定残業）あり → employment_contracts.fixed_overtime_minutes（月あたりの時間）

-- ===== 会社カレンダー（祝日） =====
create type public.holiday_kind as enum ('national', 'company_designated');

create table public.company_holidays (
  holiday_date   date primary key,
  name           text not null check (length(btrim(name)) > 0),
  holiday_kind   public.holiday_kind not null default 'national',
  -- 祝日勤務に伴う振休の付与対象日か（フェーズ4の候補生成で使用）
  credit_target  boolean not null default true,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger company_holidays_touch
  before update on public.company_holidays
  for each row execute function app.touch_updated_at();

-- ===== 診療時間 =====
-- day_of_week：0=日曜 … 6=土曜、7=祝日（祝日は曜日より優先）
-- ある期間・曜日に枠が1つも無ければ、その曜日は定休日。
-- 診療時間の変更は「新しい適用開始日で全曜日分を登録し直す」（set_clinic_business_hours）ことで履歴を残す。
create table public.clinic_business_hours (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics (clinic_id),
  day_of_week  smallint not null check (day_of_week between 0 and 7),
  slot_no      smallint not null check (slot_no between 1 and 3),
  open_time    time not null,
  close_time   time not null,
  valid_from   date not null,
  valid_to     date,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  constraint business_hours_order check (close_time > open_time),
  constraint business_hours_period check (valid_to is null or valid_to >= valid_from),
  constraint business_hours_no_overlap exclude using gist (
    clinic_id with =,
    day_of_week with =,
    slot_no with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);
create index clinic_business_hours_clinic_idx on public.clinic_business_hours (clinic_id, valid_from);

create trigger clinic_business_hours_forbid_delete
  before delete on public.clinic_business_hours
  for each row execute function app.forbid_delete();

-- ===== 臨時休診・特別診療日 =====
-- その日だけ通常の診療時間を上書きする。is_closed=false の場合は slots に当日の枠を持つ。
create table public.clinic_calendar_exceptions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (clinic_id),
  target_date date not null,
  is_closed   boolean not null,
  -- [{"open":"09:00","close":"12:00"}, ...]（is_closed=true のときは空配列）
  slots       jsonb not null default '[]'::jsonb,
  reason      text not null check (length(btrim(reason)) > 0),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendar_exception_unique unique (clinic_id, target_date),
  constraint calendar_exception_slots check (
    jsonb_typeof(slots) = 'array'
    and (is_closed = (jsonb_array_length(slots) = 0))
  )
);

create trigger clinic_calendar_exceptions_touch
  before update on public.clinic_calendar_exceptions
  for each row execute function app.touch_updated_at();

-- ===== 勤務条件 =====
alter table public.employment_contracts
  alter column daily_scheduled_minutes set default 480,
  -- みなし残業（固定残業代）に含まれる月あたりの時間外労働（分）。0 は固定残業なし。
  -- 超過分は別途支給が必要なため、月次集計で「実時間外 − みなし時間」を算出する。
  add column fixed_overtime_minutes integer not null default 0
    check (fixed_overtime_minutes between 0 and 6000);

-- ===== 権限 =====
revoke all on public.company_holidays, public.clinic_business_hours, public.clinic_calendar_exceptions
  from anon, authenticated;
grant select, insert, update on public.company_holidays to authenticated;
grant select, insert, update on public.clinic_business_hours to authenticated;
grant select, insert, update, delete on public.clinic_calendar_exceptions to authenticated;

alter table public.company_holidays enable row level security;
alter table public.clinic_business_hours enable row level security;
alter table public.clinic_calendar_exceptions enable row level security;

-- 祝日・診療時間は機微情報ではないため、ログイン済みなら参照可
create policy company_holidays_select on public.company_holidays
  for select to authenticated using (true);
create policy company_holidays_insert on public.company_holidays
  for insert to authenticated with check (app.is_hq());
create policy company_holidays_update on public.company_holidays
  for update to authenticated using (app.is_hq()) with check (app.is_hq());

-- 通常の診療時間は本部が管理する
create policy business_hours_select on public.clinic_business_hours
  for select to authenticated using (true);
create policy business_hours_insert on public.clinic_business_hours
  for insert to authenticated with check (app.is_hq());
create policy business_hours_update on public.clinic_business_hours
  for update to authenticated using (app.is_hq()) with check (app.is_hq());

-- 臨時休診・特別診療は、本部と担当院の院長が調整できる（取り消し＝削除も可。監査ログに残る）
create policy calendar_exceptions_select on public.clinic_calendar_exceptions
  for select to authenticated using (true);
create policy calendar_exceptions_insert on public.clinic_calendar_exceptions
  for insert to authenticated with check (app.can_manage_clinic(clinic_id));
create policy calendar_exceptions_update on public.clinic_calendar_exceptions
  for update to authenticated
  using (app.can_manage_clinic(clinic_id)) with check (app.can_manage_clinic(clinic_id));
create policy calendar_exceptions_delete on public.clinic_calendar_exceptions
  for delete to authenticated using (app.can_manage_clinic(clinic_id));

-- ===== 監査 =====
create trigger company_holidays_audit after insert or update on public.company_holidays
  for each row execute function app.audit_row_change('holiday_date');
create trigger clinic_business_hours_audit after insert or update on public.clinic_business_hours
  for each row execute function app.audit_row_change('id');
create trigger clinic_calendar_exceptions_audit after insert or update or delete on public.clinic_calendar_exceptions
  for each row execute function app.audit_row_change('id');

-- ===== RPC =====

-- 診療時間の登録・変更。p_slots は全曜日分：[{"day_of_week":1,"open":"09:00","close":"12:00"}, ...]
-- 適用開始日以降の既存の枠を終了（または未来分は無効化）し、新しい枠を登録する。
create or replace function public.set_clinic_business_hours(
  p_clinic_id uuid,
  p_valid_from date,
  p_slots jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  slot jsonb;
  slot_counter integer[] := array[0, 0, 0, 0, 0, 0, 0, 0];
  dow integer;
begin
  if not app.is_hq() then
    raise exception '診療時間の変更は本部のみ可能です' using errcode = '42501';
  end if;
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception '診療時間の形式が正しくありません' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.clinic_business_hours
     where clinic_id = p_clinic_id and valid_from > p_valid_from
  ) then
    raise exception '%より後の日付で登録済みの診療時間があります。そちらより後の適用日を指定してください', p_valid_from
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.clinic_business_hours
     where clinic_id = p_clinic_id and valid_from = p_valid_from
  ) then
    raise exception '%から適用の診療時間は登録済みです。別の適用日を指定してください', p_valid_from
      using errcode = '22023';
  end if;

  perform set_config('app.change_reason', format('%s から診療時間を変更', p_valid_from), true);

  -- 適用開始日の前日で、現在有効な枠を終了する
  update public.clinic_business_hours
     set valid_to = p_valid_from - 1
   where clinic_id = p_clinic_id
     and (valid_to is null or valid_to >= p_valid_from);

  for slot in select * from jsonb_array_elements(p_slots) loop
    dow := (slot ->> 'day_of_week')::integer;
    if dow is null or dow < 0 or dow > 7 then
      raise exception '曜日の指定が正しくありません' using errcode = '22023';
    end if;
    slot_counter[dow + 1] := slot_counter[dow + 1] + 1;
    insert into public.clinic_business_hours (clinic_id, day_of_week, slot_no, open_time, close_time, valid_from, created_by)
    values (p_clinic_id, dow, slot_counter[dow + 1], (slot ->> 'open')::time, (slot ->> 'close')::time, p_valid_from, auth.uid());
  end loop;
end;
$$;

-- 指定日の診療枠（臨時休診・特別診療 → 祝日 → 曜日 の順で決定）
create or replace function public.clinic_hours_on(p_clinic_id uuid, p_date date)
returns table (slot_no integer, open_time time, close_time time, source text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  ex public.clinic_calendar_exceptions;
  day_kind smallint;
begin
  select * into ex from public.clinic_calendar_exceptions where clinic_id = p_clinic_id and target_date = p_date;
  if ex.id is not null then
    return query
      select (s.ordinality)::integer, (s.value ->> 'open')::time, (s.value ->> 'close')::time, 'exception'::text
        from jsonb_array_elements(ex.slots) with ordinality as s
       order by 2;
    return;
  end if;

  if exists (select 1 from public.company_holidays where holiday_date = p_date) then
    day_kind := 7;
  else
    day_kind := extract(dow from p_date)::smallint;
  end if;

  return query
    select h.slot_no::integer, h.open_time, h.close_time, case when day_kind = 7 then 'holiday' else 'weekday' end
      from public.clinic_business_hours h
     where h.clinic_id = p_clinic_id
       and h.day_of_week = day_kind
       and app.in_period(h.valid_from, h.valid_to, p_date)
     order by h.open_time;
end;
$$;

revoke all on function public.set_clinic_business_hours(uuid, date, jsonb) from public, anon;
revoke all on function public.clinic_hours_on(uuid, date) from public, anon;
grant execute on function public.set_clinic_business_hours(uuid, date, jsonb) to authenticated;
grant execute on function public.clinic_hours_on(uuid, date) to authenticated;
