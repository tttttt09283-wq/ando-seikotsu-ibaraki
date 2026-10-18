-- 0006: マスタ操作 RPC
-- 複数テーブルにまたがる操作を1トランザクションで行う。SECURITY INVOKER のため、
-- 呼び出したユーザーの RLS がそのまま適用される（本部以外は各 INSERT/UPDATE で拒否される）。

-- スタッフ新規登録（基本情報＋個人情報＋主所属）
create or replace function public.create_staff(
  p_staff_code text,
  p_family_name text,
  p_given_name text,
  p_family_name_kana text,
  p_given_name_kana text,
  p_hire_date date,
  p_primary_clinic_id uuid,
  p_private jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_staff_id uuid;
begin
  if not app.is_hq() then
    raise exception 'スタッフ登録は本部のみ可能です' using errcode = '42501';
  end if;

  insert into public.staff_profiles (staff_code, family_name, given_name, family_name_kana, given_name_kana, hire_date)
  values (p_staff_code, p_family_name, p_given_name, p_family_name_kana, p_given_name_kana, p_hire_date)
  returning staff_id into new_staff_id;

  insert into public.staff_private_details (
    staff_id, birth_date, phone, email, postal_code, address, emergency_contact_name, emergency_contact_phone, notes
  ) values (
    new_staff_id,
    nullif(p_private ->> 'birth_date', '')::date,
    nullif(p_private ->> 'phone', ''),
    nullif(p_private ->> 'email', ''),
    nullif(p_private ->> 'postal_code', ''),
    nullif(p_private ->> 'address', ''),
    nullif(p_private ->> 'emergency_contact_name', ''),
    nullif(p_private ->> 'emergency_contact_phone', ''),
    nullif(p_private ->> 'notes', '')
  );

  insert into public.staff_clinic_assignments (staff_id, clinic_id, assignment_type, valid_from, created_by)
  values (new_staff_id, p_primary_clinic_id, 'primary', p_hire_date, auth.uid());

  return new_staff_id;
end;
$$;

-- スタッフ情報の更新（基本情報＋個人情報を同時に）
create or replace function public.update_staff(
  p_staff_id uuid,
  p_profile jsonb,
  p_private jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception 'スタッフ情報の変更は本部のみ可能です' using errcode = '42501';
  end if;

  update public.staff_profiles
     set family_name      = p_profile ->> 'family_name',
         given_name       = p_profile ->> 'given_name',
         family_name_kana = nullif(p_profile ->> 'family_name_kana', ''),
         given_name_kana  = nullif(p_profile ->> 'given_name_kana', ''),
         hire_date        = (p_profile ->> 'hire_date')::date,
         retire_date      = nullif(p_profile ->> 'retire_date', '')::date,
         status           = (p_profile ->> 'status')::public.staff_status
   where staff_id = p_staff_id;
  if not found then
    raise exception 'スタッフが見つかりません' using errcode = 'P0002';
  end if;

  insert into public.staff_private_details (staff_id) values (p_staff_id) on conflict (staff_id) do nothing;
  update public.staff_private_details
     set birth_date              = nullif(p_private ->> 'birth_date', '')::date,
         phone                   = nullif(p_private ->> 'phone', ''),
         email                   = nullif(p_private ->> 'email', ''),
         postal_code             = nullif(p_private ->> 'postal_code', ''),
         address                 = nullif(p_private ->> 'address', ''),
         emergency_contact_name  = nullif(p_private ->> 'emergency_contact_name', ''),
         emergency_contact_phone = nullif(p_private ->> 'emergency_contact_phone', ''),
         notes                   = nullif(p_private ->> 'notes', '')
   where staff_id = p_staff_id;
end;
$$;

-- 所属院の異動：現在の主所属を (効力日 - 1日) で終了し、新しい主所属を効力日から開始する
create or replace function public.transfer_staff(
  p_staff_id uuid,
  p_new_clinic_id uuid,
  p_effective_date date,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_assignment public.staff_clinic_assignments;
  new_assignment_id uuid;
begin
  if not app.is_hq() then
    raise exception '異動登録は本部のみ可能です' using errcode = '42501';
  end if;

  select * into current_assignment
    from public.staff_clinic_assignments
   where staff_id = p_staff_id
     and assignment_type = 'primary'
     and app.in_period(valid_from, valid_to, p_effective_date)
   for update;

  if current_assignment.assignment_id is not null then
    if current_assignment.clinic_id = p_new_clinic_id then
      raise exception '異動先が現在の所属院と同じです' using errcode = '22023';
    end if;
    if current_assignment.valid_from >= p_effective_date then
      raise exception '異動日は現在の所属開始日より後にしてください' using errcode = '22023';
    end if;
    update public.staff_clinic_assignments
       set valid_to = p_effective_date - 1
     where assignment_id = current_assignment.assignment_id;
  end if;

  insert into public.staff_clinic_assignments (staff_id, clinic_id, assignment_type, valid_from, note, created_by)
  values (p_staff_id, p_new_clinic_id, 'primary', p_effective_date, p_note, auth.uid())
  returning assignment_id into new_assignment_id;

  return new_assignment_id;
end;
$$;

-- 院の状態変更（営業中・休止・閉鎖）。閉鎖院も行は残る。
create or replace function public.set_clinic_status(
  p_clinic_id uuid,
  p_status public.clinic_status,
  p_effective_date date,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception '店舗の状態変更は本部のみ可能です' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception '状態変更の理由を入力してください' using errcode = '22023';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update public.clinics
     set status = p_status,
         suspended_on = case when p_status = 'suspended' then p_effective_date else suspended_on end,
         closed_on = case when p_status = 'closed' then p_effective_date
                          when p_status = 'active' then null else closed_on end
   where clinic_id = p_clinic_id;

  if not found then
    raise exception '店舗が見つかりません' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_staff(text, text, text, text, text, date, uuid, jsonb) from public, anon;
revoke all on function public.update_staff(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.transfer_staff(uuid, uuid, date, text) from public, anon;
revoke all on function public.set_clinic_status(uuid, public.clinic_status, date, text) from public, anon;
grant execute on function public.create_staff(text, text, text, text, text, date, uuid, jsonb) to authenticated;
grant execute on function public.update_staff(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.transfer_staff(uuid, uuid, date, text) to authenticated;
grant execute on function public.set_clinic_status(uuid, public.clinic_status, date, text) to authenticated;
