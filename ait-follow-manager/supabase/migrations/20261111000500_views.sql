-- =============================================================================
-- A.I.T Follow Manager — 05. 一覧表示用ビュー（security_invoker：RLS が適用される）
-- =============================================================================

create view public.customer_overview with (security_invoker = true) as
select
  c.id, c.organization_id, c.store_id, c.customer_code, c.family_name, c.given_name,
  c.family_name_kana, c.given_name_kana, c.phone, c.email, c.assigned_staff_id, c.contact_status,
  c.first_visit_on, c.last_visit_on, c.search_text, c.created_at,
  (select min(a.scheduled_at) from public.appointments a
    where a.customer_id = c.id and a.status in ('scheduled', 'confirmed') and a.scheduled_at >= now()) as next_appointment_at,
  (select count(*) from public.followup_tasks t where t.customer_id = c.id and t.status = 'open')::int as open_task_count,
  (select count(*) from public.followup_tasks t where t.customer_id = c.id and t.status = 'open'
     and t.due_on < (now() at time zone 'Asia/Tokyo')::date)::int as overdue_task_count,
  coalesce((select array_agg(ct.tag_id) from public.customer_tags ct where ct.customer_id = c.id), '{}'::uuid[]) as tag_ids
from public.customers c
where c.deleted_at is null;

revoke all on public.customer_overview from anon, authenticated;
grant select on public.customer_overview to authenticated, service_role;

-- ロール変更（組織管理者のみ。RLS の with check により店舗責任者は staff 以外に変更できない）
grant update (role) on public.memberships to authenticated;

-- 連絡記録の担当者（スタッフ名の表示用）
alter table public.contact_logs
  add constraint contact_logs_staff_id_fkey foreign key (staff_id) references public.users(id) on delete set null;
