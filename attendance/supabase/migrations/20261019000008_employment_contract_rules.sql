-- 0008: 勤務条件の確定ルール（2026-10-19 回答）
--   - 週5日勤務・1日8時間（週40時間）
--   - みなし残業：正社員は基本 月24時間。人により異なり、変更は本部のみ

alter table public.employment_contracts
  alter column weekly_scheduled_days set default 5,
  alter column weekly_scheduled_minutes set default 2400;

-- 正社員のみなし残業の標準時間（分）
create or replace function app.default_fixed_overtime_minutes(p_employment_type public.employment_type)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_employment_type = 'full_time' then 1440 else 0 end
$$;

-- 雇用契約（勤務条件）の登録・変更（本部のみ）
-- - 適用開始日が既存の契約と同じ場合：その契約を訂正する（理由必須・監査ログに記録）
-- - 新しい適用開始日の場合：現在の契約を前日で終了し、新しい契約を開始する
-- - p_fixed_overtime_minutes が NULL の場合は雇用形態の標準値（正社員 24時間、その他 0）
create or replace function public.set_employment_contract(
  p_staff_id uuid,
  p_valid_from date,
  p_employment_type public.employment_type,
  p_weekly_scheduled_days numeric,
  p_weekly_scheduled_minutes integer,
  p_daily_scheduled_minutes integer,
  p_fixed_overtime_minutes integer,
  p_legal_weekly_limit_minutes integer,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  same_day public.employment_contracts;
  result_id uuid;
  fixed_minutes integer := coalesce(p_fixed_overtime_minutes, app.default_fixed_overtime_minutes(p_employment_type));
begin
  if not app.is_hq() then
    raise exception '勤務条件の変更は本部のみ可能です' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception '登録・変更の理由を入力してください' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.employment_contracts where staff_id = p_staff_id and valid_from > p_valid_from
  ) then
    raise exception '%より後に開始する勤務条件が登録済みです', p_valid_from using errcode = '22023';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  select * into same_day
    from public.employment_contracts
   where staff_id = p_staff_id and valid_from = p_valid_from
   for update;

  if same_day.contract_id is not null then
    update public.employment_contracts
       set employment_type            = p_employment_type,
           weekly_scheduled_days      = p_weekly_scheduled_days,
           weekly_scheduled_minutes   = p_weekly_scheduled_minutes,
           daily_scheduled_minutes    = p_daily_scheduled_minutes,
           fixed_overtime_minutes     = fixed_minutes,
           legal_weekly_limit_minutes = p_legal_weekly_limit_minutes,
           note                       = p_reason
     where contract_id = same_day.contract_id
    returning contract_id into result_id;
    return result_id;
  end if;

  update public.employment_contracts
     set valid_to = p_valid_from - 1
   where staff_id = p_staff_id
     and valid_from < p_valid_from
     and (valid_to is null or valid_to >= p_valid_from);

  insert into public.employment_contracts (
    staff_id, valid_from, employment_type, weekly_scheduled_days, weekly_scheduled_minutes,
    daily_scheduled_minutes, fixed_overtime_minutes, legal_weekly_limit_minutes, note, created_by
  ) values (
    p_staff_id, p_valid_from, p_employment_type, p_weekly_scheduled_days, p_weekly_scheduled_minutes,
    p_daily_scheduled_minutes, fixed_minutes, p_legal_weekly_limit_minutes, p_reason, auth.uid()
  )
  returning contract_id into result_id;
  return result_id;
end;
$$;

revoke all on function app.default_fixed_overtime_minutes(public.employment_type) from public;
grant execute on function app.default_fixed_overtime_minutes(public.employment_type) to authenticated, service_role;
revoke all on function public.set_employment_contract(uuid, date, public.employment_type, numeric, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.set_employment_contract(uuid, date, public.employment_type, numeric, integer, integer, integer, integer, text) to authenticated;
