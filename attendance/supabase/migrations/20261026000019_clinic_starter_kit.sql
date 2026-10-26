-- 0019: 各院への「使い始めセット」（端末の登録コード・スタッフのPINをまとめて Excel で配布）
--   ・端末の登録コードの有効期限を指定できるようにする（データで送って院で後日設定するため。最長7日）
--   ・院ごとのスタッフとPINの発行状況を本部がまとめて確認できるようにする（PINそのものは誰も参照できない）

drop function if exists public.issue_kiosk_registration(uuid, text, uuid);

-- 端末の登録コードを発行（本部のみ）。p_device_id を指定すると既存端末を再登録（旧端末は使えなくなる）
create or replace function public.issue_kiosk_registration(p_clinic_id uuid, p_name text, p_device_id uuid default null, p_valid_hours integer default 24)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  bytes bytea := extensions.gen_random_bytes(8);
  v_device_id uuid;
  v_expires timestamptz;
  i integer;
begin
  if not app.is_hq() then
    raise exception '端末の登録は本部のみ可能です' using errcode = '42501';
  end if;
  if p_valid_hours is null or p_valid_hours < 1 or p_valid_hours > 168 then
    raise exception '登録コードの有効期限は1時間〜7日の間で指定してください' using errcode = '22023';
  end if;
  v_expires := now() + make_interval(hours => p_valid_hours);
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;

  if p_device_id is null then
    insert into public.kiosk_devices (clinic_id, name, status, registration_code_hash, registration_expires_at, created_by)
    values (p_clinic_id, p_name, 'pending', app.sha256_hex(code), v_expires, auth.uid())
    returning device_id into v_device_id;
  else
    update public.kiosk_devices
       set status = 'pending', secret_hash = null, registration_code_hash = app.sha256_hex(code),
           registration_expires_at = v_expires, name = coalesce(nullif(btrim(p_name), ''), name)
     where device_id = p_device_id
       and clinic_id = p_clinic_id
    returning device_id into v_device_id;
    if v_device_id is null then
      raise exception '端末が見つかりません' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id, after)
  values (auth.uid(), 'user', 'issue_registration', 'kiosk_devices', v_device_id::text,
          jsonb_build_object('clinic_id', p_clinic_id, 'name', p_name, 'valid_hours', p_valid_hours));
  return jsonb_build_object('device_id', v_device_id, 'code', code, 'expires_at', v_expires);
end;
$$;

-- 院のスタッフ（その日に主所属がこの院の在籍者）と PIN の発行状況（本部のみ）
create or replace function public.clinic_pin_overview(p_clinic_id uuid)
returns table (staff_id uuid, staff_code text, family_name text, given_name text, has_pin boolean, must_change boolean, locked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception 'PINの発行状況の確認は本部のみ可能です' using errcode = '42501';
  end if;
  return query
    select s.staff_id, s.staff_code, s.family_name, s.given_name,
           c.staff_id is not null, coalesce(c.must_change, false), coalesce(c.locked_until > now(), false)
      from public.staff_profiles s
      left join public.kiosk_credentials c on c.staff_id = s.staff_id
     where s.status <> 'retired'
       and app.staff_primary_clinic_id(s.staff_id) = p_clinic_id
     order by s.staff_code;
end;
$$;

revoke all on function public.issue_kiosk_registration(uuid, text, uuid, integer) from public, anon;
revoke all on function public.clinic_pin_overview(uuid) from public, anon;
grant execute on function public.issue_kiosk_registration(uuid, text, uuid, integer) to authenticated;
grant execute on function public.clinic_pin_overview(uuid) to authenticated;
