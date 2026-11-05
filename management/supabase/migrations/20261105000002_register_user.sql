-- スタッフの登録（プロフィール＋最初の所属を1つのトランザクションで）
-- security invoker：呼び出した人の権限（RLS）で動く。社長（master.manage）以外は失敗する
create or replace function mgmt.register_user(
  p_id uuid, p_staff_code text, p_login_id text, p_name text, p_name_kana text,
  p_employment_type text, p_hire_date date, p_pos_staff_id int, p_must_change_password boolean,
  p_store uuid, p_store_role text, p_starts_on date
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_role uuid;
begin
  if not mgmt.can('master.manage') then
    raise exception 'スタッフを登録する権限がありません' using errcode = '42501';
  end if;
  insert into mgmt.users (id, staff_code, login_id, name, name_kana, employment_type, hire_date, pos_staff_id, must_change_password, created_by, updated_by)
  values (p_id, p_staff_code, p_login_id, p_name, p_name_kana, p_employment_type, p_hire_date, p_pos_staff_id, p_must_change_password, mgmt.current_user_id(), mgmt.current_user_id());
  if p_store is not null then
    select id into v_role from mgmt.roles where code = p_store_role and scope = 'store';
    if v_role is null then raise exception '店舗での役職が正しくありません'; end if;
    insert into mgmt.user_store_assignments (user_id, store_id, role_id, is_primary, starts_on, created_by)
    values (p_id, p_store, v_role, true, coalesce(p_starts_on, mgmt.jst_today()), mgmt.current_user_id());
  end if;
  return p_id;
end $$;

revoke execute on function mgmt.register_user(uuid, text, text, text, text, text, date, int, boolean, uuid, text, date) from public, anon;
grant execute on function mgmt.register_user(uuid, text, text, text, text, text, date, int, boolean, uuid, text, date) to authenticated;
