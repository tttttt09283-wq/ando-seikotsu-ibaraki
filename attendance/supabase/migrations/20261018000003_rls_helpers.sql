-- 0003: RLS 判定ヘルパー
-- いずれも SECURITY DEFINER（テーブル所有者権限で実行）とし、ポリシー内からの再帰的な RLS 評価を避ける。
-- search_path を空にして、関数の乗っ取り（同名オブジェクトの差し込み）を防ぐ。

-- 期間判定：on_date が [valid_from, valid_to] に入っているか（valid_to NULL は無期限）
create or replace function app.in_period(valid_from date, valid_to date, on_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select valid_from <= on_date and (valid_to is null or valid_to >= on_date)
$$;

-- ログイン中ユーザーが、本日有効な role を持つか
create or replace function app.has_role(target public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles r
      join public.app_accounts a on a.user_id = r.user_id
     where r.user_id = auth.uid()
       and r.role = target
       and not a.disabled
       and app.in_period(r.valid_from, r.valid_to, app.today_jst())
  )
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role('super_admin')
$$;

-- 本部権限（super_admin または hq_admin）
create or replace function app.is_hq()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role('super_admin') or app.has_role('hq_admin')
$$;

-- 院長として担当している院（兼務の場合は複数）
create or replace function app.managed_clinic_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.clinic_id), '{}'::uuid[])
    from public.user_roles r
    join public.app_accounts a on a.user_id = r.user_id
   where r.user_id = auth.uid()
     and r.role = 'clinic_manager'
     and not a.disabled
     and app.in_period(r.valid_from, r.valid_to, app.today_jst())
$$;

-- ログイン中ユーザーに紐付くスタッフ
create or replace function app.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.staff_id from public.staff_profiles s where s.auth_user_id = auth.uid() and auth.uid() is not null
$$;

-- 指定日時点の主所属院
create or replace function app.staff_primary_clinic_id(target_staff uuid, on_date date default null)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.clinic_id
    from public.staff_clinic_assignments a
   where a.staff_id = target_staff
     and a.assignment_type = 'primary'
     and app.in_period(a.valid_from, a.valid_to, coalesce(on_date, app.today_jst()))
   limit 1
$$;

-- 基本情報（氏名・スタッフコード）の閲覧可否
-- 院長：担当院に主所属または応援登録があるスタッフ。
--   異動・応援終了後も前月分の確認・締めができるよう、終了後 93 日間と、開始前（異動予定）も含める。
create or replace function app.can_view_staff_basic(target_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_hq()
      or target_staff = app.current_staff_id()
      or exists (
        select 1
          from public.staff_clinic_assignments a
         where a.staff_id = target_staff
           and a.clinic_id = any (app.managed_clinic_ids())
           and (a.valid_to is null or a.valid_to >= app.today_jst() - 93)
      )
$$;

-- 個人情報（住所・電話・生年月日など）の閲覧可否
-- 院長：本日時点の「主所属院」の院長のみ。応援先・異動前後の院長は閲覧できない。
create or replace function app.can_view_staff_private(target_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_hq()
      or target_staff = app.current_staff_id()
      or app.staff_primary_clinic_id(target_staff) = any (app.managed_clinic_ids())
$$;

-- 院の運営権限（本部、または担当院の院長）
create or replace function app.can_manage_clinic(target_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_hq() or target_clinic = any (app.managed_clinic_ids())
$$;

-- 対象ユーザーが本日有効な本部・管理者ロールを持つか
create or replace function app.is_privileged_user(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles r
     where r.user_id = target_user
       and r.role in ('super_admin', 'hq_admin')
       and app.in_period(r.valid_from, r.valid_to, app.today_jst())
  )
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- クライアント（画面の表示制御）向けに、自分のロールを返す RPC
create or replace function public.my_roles()
returns table (role public.app_role, clinic_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.role, r.clinic_id
    from public.user_roles r
    join public.app_accounts a on a.user_id = r.user_id
   where r.user_id = auth.uid()
     and not a.disabled
     and app.in_period(r.valid_from, r.valid_to, app.today_jst())
$$;

revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;
