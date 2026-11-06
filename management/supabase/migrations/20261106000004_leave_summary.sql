-- 院ごとの残数一覧（院長ダッシュボード・スタッフ別残数）。見られる人の分だけ返す
create or replace function mgmt.store_leave_summary(p_store uuid, p_as_of date default mgmt.jst_today())
returns table (
  user_id uuid, name text, role_code text, employment_type text, hire_date date,
  paid jsonb, shift jsonb, shift_holiday jsonb, five_day jsonb
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.name, r.code, u.employment_type, u.hire_date,
    mgmt.leave_balance(u.id, 'PAID', p_as_of) - 'grants',
    mgmt.leave_balance(u.id, 'SHIFT', p_as_of) - 'grants',
    mgmt.leave_balance(u.id, 'SHIFT_HOLIDAY', p_as_of) - 'grants',
    mgmt.five_day_status(u.id, p_as_of)
  from mgmt.user_store_assignments a
  join mgmt.users u on u.id = a.user_id and u.status = 'active'
  join mgmt.roles r on r.id = a.role_id
  where a.store_id = p_store and mgmt.is_current(a.starts_on, a.ends_on)
    and mgmt.can_view_leave_of(u.id)
  order by r.rank, u.name
$$;
revoke execute on function mgmt.store_leave_summary(uuid, date) from public, anon;
grant execute on function mgmt.store_leave_summary(uuid, date) to authenticated, service_role;

-- 振休の発生（公休出勤・祝日出勤）の登録：その人が所属する院の院長・社長（docs/workflows.md §2・Q-2）
-- 権限 leave.shift.register（院長・社長）は seed/0001_master.sql で登録する

create or replace function mgmt.can_register_shift_for(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select mgmt.can('leave.shift.register') or exists (
    select 1 from mgmt.user_store_assignments a
    where a.user_id = p_user and mgmt.is_current(a.starts_on, a.ends_on) and mgmt.can('leave.shift.register', a.store_id)
  )
$$;

create or replace function mgmt.register_shift_earned(p_user uuid, p_type_code text, p_work_date date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_type uuid; v_id uuid;
begin
  if not mgmt.can_register_shift_for(p_user) then
    raise exception 'この人の振休を登録する権限がありません' using errcode = '42501';
  end if;
  if p_type_code not in ('SHIFT','SHIFT_HOLIDAY') then raise exception '区分は振替か祝振替です'; end if;
  if p_work_date > mgmt.jst_today() then raise exception '出勤した日に未来の日付は入れられません'; end if;
  select id into v_type from mgmt.leave_types where code = p_type_code;
  if exists (select 1 from mgmt.leave_grants where user_id = p_user and leave_type_id in (select id from mgmt.leave_types where code in ('SHIFT','SHIFT_HOLIDAY'))
             and origin_work_date = p_work_date and voided_at is null) then
    raise exception 'この日の出勤による振休はすでに登録されています';
  end if;
  insert into mgmt.leave_grants (user_id, leave_type_id, grant_date, expires_on, days, source, origin_work_date, note, created_by)
  values (p_user, v_type, p_work_date, mgmt.expiry_for(v_type, p_work_date), 1, 'shift_earned', p_work_date, nullif(btrim(p_note), ''), mgmt.current_user_id())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function mgmt.can_register_shift_for(uuid), mgmt.register_shift_earned(uuid, text, date, text) from public, anon;
grant execute on function mgmt.can_register_shift_for(uuid), mgmt.register_shift_earned(uuid, text, date, text) to authenticated, service_role;

-- 同じ人・同じ区分・同じ付与日の「法定付与」「移行時点の残数」は1件だけ（二度押し・二重取り込みの防止）
create unique index leave_grants_no_double_statutory on mgmt.leave_grants (user_id, leave_type_id, grant_date)
  where voided_at is null and source in ('statutory','migration');
