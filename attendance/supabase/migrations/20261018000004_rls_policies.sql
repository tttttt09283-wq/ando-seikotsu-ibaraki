-- 0004: テーブル権限と Row Level Security
-- 方針：anon には一切与えない。authenticated には必要な操作だけ GRANT し、行の可否は RLS で判定する。
-- DELETE は全テーブルで GRANT しない（論理削除・期間終了で表現）。

revoke all on public.clinics, public.clinic_name_history, public.staff_profiles,
  public.staff_private_details, public.staff_clinic_assignments, public.employment_contracts,
  public.app_accounts, public.user_roles
  from anon, authenticated;

grant select, insert, update on public.clinics to authenticated;
grant select on public.clinic_name_history to authenticated;
grant select, insert, update on public.staff_profiles to authenticated;
grant select, insert, update on public.staff_private_details to authenticated;
grant select, insert, update on public.staff_clinic_assignments to authenticated;
grant select, insert, update on public.employment_contracts to authenticated;
grant select, insert, update on public.app_accounts to authenticated;
grant select, insert, update on public.user_roles to authenticated;

alter table public.clinics enable row level security;
alter table public.clinic_name_history enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_private_details enable row level security;
alter table public.staff_clinic_assignments enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.app_accounts enable row level security;
alter table public.user_roles enable row level security;

-- ===== clinics =====
-- 院名・状態は機微情報ではないため、ログイン済みなら全院を参照可（応援先の院名表示などに使う）
create policy clinics_select on public.clinics
  for select to authenticated using (true);
create policy clinics_insert on public.clinics
  for insert to authenticated with check (app.is_hq());
create policy clinics_update on public.clinics
  for update to authenticated using (app.is_hq()) with check (app.is_hq());

create policy clinic_name_history_select on public.clinic_name_history
  for select to authenticated using (true);

-- ===== staff_profiles（基本情報） =====
create policy staff_profiles_select on public.staff_profiles
  for select to authenticated using (app.can_view_staff_basic(staff_id));
create policy staff_profiles_insert on public.staff_profiles
  for insert to authenticated with check (app.is_hq());
create policy staff_profiles_update on public.staff_profiles
  for update to authenticated using (app.is_hq()) with check (app.is_hq());

-- ===== staff_private_details（個人情報） =====
create policy staff_private_select on public.staff_private_details
  for select to authenticated using (app.can_view_staff_private(staff_id));
create policy staff_private_insert on public.staff_private_details
  for insert to authenticated with check (app.is_hq());
create policy staff_private_update on public.staff_private_details
  for update to authenticated using (app.is_hq()) with check (app.is_hq());

-- ===== staff_clinic_assignments =====
create policy assignments_select on public.staff_clinic_assignments
  for select to authenticated using (
    app.is_hq()
    or staff_id = app.current_staff_id()
    or clinic_id = any (app.managed_clinic_ids())
  );
create policy assignments_insert on public.staff_clinic_assignments
  for insert to authenticated with check (app.is_hq());
create policy assignments_update on public.staff_clinic_assignments
  for update to authenticated using (app.is_hq()) with check (app.is_hq());

-- ===== employment_contracts =====
-- 勤務条件は主所属院の院長まで（応援先の院長には見せない）
create policy contracts_select on public.employment_contracts
  for select to authenticated using (app.can_view_staff_private(staff_id));
create policy contracts_insert on public.employment_contracts
  for insert to authenticated with check (app.is_hq());
create policy contracts_update on public.employment_contracts
  for update to authenticated using (app.is_hq()) with check (app.is_hq());

-- ===== app_accounts =====
create policy app_accounts_select on public.app_accounts
  for select to authenticated using (app.is_hq() or user_id = auth.uid());
create policy app_accounts_insert on public.app_accounts
  for insert to authenticated with check (app.is_hq());
-- 本部事務は、本部・管理者ロールを持つアカウント（自分自身を含む）を変更できない。変更はシステム管理者が行う
create policy app_accounts_update on public.app_accounts
  for update to authenticated
  using (app.is_super_admin() or (app.is_hq() and not app.is_privileged_user(user_id)))
  with check (app.is_super_admin() or (app.is_hq() and not app.is_privileged_user(user_id)));

-- ===== user_roles =====
-- super_admin は全ロールを付与可。hq_admin は院長・スタッフのみ付与可（本部・管理者ロールの昇格は不可）。
create policy user_roles_select on public.user_roles
  for select to authenticated using (app.is_hq() or user_id = auth.uid());
create policy user_roles_insert on public.user_roles
  for insert to authenticated with check (
    app.is_super_admin()
    or (app.is_hq() and role in ('clinic_manager', 'staff'))
  );
create policy user_roles_update on public.user_roles
  for update to authenticated
  using (app.is_super_admin() or (app.is_hq() and role in ('clinic_manager', 'staff')))
  with check (app.is_super_admin() or (app.is_hq() and role in ('clinic_manager', 'staff')));
