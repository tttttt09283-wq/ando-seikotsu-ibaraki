-- =============================================================================
-- A.I.T Follow Manager — 04. 業務関数（組織作成・初期データ・匿名化・集計・タスク対応）
-- security definer の関数は冒頭で必ず権限を検証する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 組織の初期データ（テンプレート5種＋フォロールール）
-- -----------------------------------------------------------------------------
create or replace function app.seed_organization_defaults(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t_thanks uuid; t_check uuid; t_next uuid; t_lapsed uuid;
begin
  insert into public.organization_counters (organization_id) values (org) on conflict do nothing;

  insert into public.message_templates (organization_id, category, name, body) values
    (org, 'thanks_first_visit', '初回来店のお礼',
     E'{{顧客名}}様\n\nこの度は{{店舗名}}にご来店いただき、誠にありがとうございました。\nご不明な点やご要望がございましたら、お気軽にご連絡ください。\n今後ともよろしくお願いいたします。\n\n{{店舗名}} {{担当者名}}')
    returning id into t_thanks;
  insert into public.message_templates (organization_id, category, name, body) values
    (org, 'condition_check', 'ご来店後のご様子伺い',
     E'{{顧客名}}様\n\n先日はご来店いただきありがとうございました。\nその後お変わりなくお過ごしでしょうか。\n気になることがございましたら、いつでもご相談ください。\n\n{{店舗名}} {{担当者名}}')
    returning id into t_check;
  insert into public.message_templates (organization_id, category, name, body) values
    (org, 'next_appointment', '次回ご予約のご案内',
     E'{{顧客名}}様\n\nいつも{{店舗名}}をご利用いただきありがとうございます。\n次回のご来店について、ご都合のよい日時がございましたらお気軽にお知らせください。\n\n{{店舗名}} {{担当者名}}')
    returning id into t_next;
  insert into public.message_templates (organization_id, category, name, body) values
    (org, 'lapsed', 'しばらくご来店のない方へのご案内',
     E'{{顧客名}}様\n\nご無沙汰しております。{{店舗名}}です。\nその後いかがお過ごしでしょうか。\nまたお会いできる日をスタッフ一同楽しみにしております。\n\n{{店舗名}} {{担当者名}}')
    returning id into t_lapsed;
  insert into public.message_templates (organization_id, category, name, body) values
    (org, 'seasonal', '季節のご挨拶',
     E'{{顧客名}}様\n\n季節の変わり目となりましたが、いかがお過ごしでしょうか。\nどうぞご自愛ください。\n今後とも{{店舗名}}をよろしくお願いいたします。\n\n{{店舗名}} {{担当者名}}');

  insert into public.followup_rules
    (organization_id, name, rule_type, offset_days, due_in_days, max_lookback_days, task_kind, priority, default_template_id, is_active)
  values
    (org, '初回来店のお礼',           'days_since_first_visit',        1,  2, 14, 'contact',  'high',   t_thanks, true),
    (org, '来店後のご様子伺い',       'days_since_last_visit',         7,  3, 14, 'contact',  'normal', t_check,  true),
    (org, '次回予約の確認',           'no_confirmed_next_appointment', 3,  3, 14, 'internal', 'normal', t_next,   true),
    (org, 'しばらく来店のない方',     'days_since_last_visit',        60,  7, 30, 'contact',  'low',    t_lapsed, true),
    (org, '前回フォローから90日経過', 'days_since_last_followup',     90,  7, 30, 'contact',  'low',    t_lapsed, false);
end $$;
revoke all on function app.seed_organization_defaults(uuid) from public;

-- -----------------------------------------------------------------------------
-- Platform Admin 用
-- -----------------------------------------------------------------------------
create or replace function public.platform_create_organization(p_name text, p_slug text, p_timezone text default 'Asia/Tokyo')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.organizations (name, slug, timezone) values (p_name, p_slug, p_timezone) returning id into org;
  perform app.seed_organization_defaults(org);
  perform app.write_audit(null, 'platform.organization_created', 'organizations', org,
    jsonb_build_object('slug', p_slug));
  return org;
end $$;

create or replace function public.platform_set_organization_status(p_org uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.organizations set status = p_status where id = p_org;
  perform app.write_audit(null, 'platform.organization_status', 'organizations', p_org,
    jsonb_build_object('status', p_status));
end $$;

-- 個人情報を含まない件数のみを返す
create or replace function public.platform_org_summaries()
returns table (id uuid, name text, slug text, status text, created_at timestamptz,
               store_count bigint, member_count bigint, customer_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.slug, o.status, o.created_at,
         (select count(*) from public.stores s where s.organization_id = o.id),
         (select count(distinct m.user_id) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
         (select count(*) from public.customers c where c.organization_id = o.id and c.deleted_at is null)
  from public.organizations o
  order by o.created_at desc;
end $$;

create or replace function public.platform_audit_logs(p_limit int default 100)
returns table (id bigint, actor_user_id uuid, action text, entity_type text, entity_id uuid, changes jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select a.id, a.actor_user_id, a.action, a.entity_type, a.entity_id, a.changes, a.created_at
  from public.audit_logs a
  where a.action like 'platform.%'
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

-- -----------------------------------------------------------------------------
-- 顧客の削除（個人情報の匿名化）— org_admin のみ
-- -----------------------------------------------------------------------------
create or replace function public.anonymize_customer(p_customer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  select id, organization_id into c from public.customers where id = p_customer and anonymized_at is null;
  if not found or not app.is_org_admin(c.organization_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  update public.followup_tasks
     set status = 'not_applicable', close_reason = 'customer_deleted', result_note = null
   where customer_id = p_customer and status in ('open', 'on_hold');
  update public.followup_tasks set result_note = null where customer_id = p_customer;
  delete from public.customer_notes where customer_id = p_customer;
  delete from public.customer_tags where customer_id = p_customer;
  update public.contact_logs set content = null where customer_id = p_customer;
  update public.consent_records set note = null where customer_id = p_customer;
  update public.appointments set note = null, external_ref = null where customer_id = p_customer;
  update public.visits set menu_label = null where customer_id = p_customer;

  update public.customers
     set family_name = '削除済み', given_name = '', family_name_kana = '', given_name_kana = '',
         phone = null, email = null, assigned_staff_id = null,
         customer_code = 'DEL-' || left(replace(id::text, '-', ''), 12),
         deleted_at = now(), anonymized_at = now()
   where id = p_customer;

  perform app.write_audit(c.organization_id, 'customer.anonymized', 'customers', p_customer, '{}'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- タスク対応（対応記録とステータス更新を1トランザクションで）— security invoker（RLS が適用される）
-- -----------------------------------------------------------------------------
create or replace function public.record_task_action(
  p_task uuid,
  p_status text,
  p_channel text default null,
  p_outcome text default null,
  p_content text default null,
  p_template uuid default null,
  p_note text default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  t record;
begin
  select id, organization_id, store_id, customer_id into t from public.followup_tasks where id = p_task;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_status not in ('open', 'done', 'on_hold', 'not_applicable') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  if p_channel is not null then
    insert into public.contact_logs (organization_id, store_id, customer_id, task_id, template_id, channel, outcome, content, staff_id)
    values (t.organization_id, t.store_id, t.customer_id, t.id, p_template, p_channel, coalesce(p_outcome, 'other'), p_content, auth.uid());
  end if;

  update public.followup_tasks
     set status = p_status,
         close_reason = case when p_status = 'not_applicable' then 'manual' else null end,
         result_note = coalesce(p_note, result_note)
   where id = p_task;
end $$;

-- -----------------------------------------------------------------------------
-- 抽出ジョブ用の顧客スナップショット（service_role のみ）
-- -----------------------------------------------------------------------------
create or replace function public.followup_customer_snapshots(p_org uuid, p_as_of date)
returns table (
  customer_id uuid, store_id uuid, assigned_staff_id uuid, contact_status text,
  first_visit_on date, last_visit_on date, next_appointment_at timestamptz, last_followup_on date, is_deleted boolean
)
language sql stable security definer set search_path = '' as $$
  with o as (select timezone from public.organizations where id = p_org)
  select c.id, c.store_id, c.assigned_staff_id, c.contact_status, c.first_visit_on, c.last_visit_on,
         (select min(a.scheduled_at) from public.appointments a
           where a.customer_id = c.id and a.status in ('scheduled', 'confirmed')
             and a.scheduled_at >= (p_as_of::timestamp at time zone (select timezone from o))),
         (select max((l.contacted_at at time zone (select timezone from o))::date) from public.contact_logs l
           where l.customer_id = c.id and l.outcome in ('reached', 'sent', 'replied', 'appointment_reported')),
         (c.deleted_at is not null or c.anonymized_at is not null)
  from public.customers c
  where c.organization_id = p_org;
$$;
revoke all on function public.followup_customer_snapshots(uuid, date) from public, anon, authenticated;
grant execute on function public.followup_customer_snapshots(uuid, date) to service_role;

-- -----------------------------------------------------------------------------
-- ダッシュボード集計 — security invoker（閲覧範囲は RLS に従う）
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_org uuid, p_as_of date)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with
  t as (select * from public.followup_tasks where organization_id = p_org),
  month_start as (select date_trunc('month', p_as_of)::date d),
  done_month as (
    select * from t where status = 'done'
      and completed_at >= (select d from month_start)::timestamp at time zone 'Asia/Tokyo'
  ),
  per_store as (
    select s.id, s.name,
      count(t.id) filter (where t.status = 'open' and t.due_on = p_as_of) today,
      count(t.id) filter (where t.status = 'open' and t.due_on < p_as_of) overdue,
      count(t.id) filter (where t.status = 'open') open,
      count(t.id) filter (where t.status = 'done' and t.completed_at >= (select d from month_start)::timestamp at time zone 'Asia/Tokyo') done_month
    from public.stores s
    left join t on t.store_id = s.id
    where s.organization_id = p_org and s.is_active
    group by s.id, s.name
  )
  select jsonb_build_object(
    'today', (select count(*) from t where status = 'open' and due_on = p_as_of),
    'overdue', (select count(*) from t where status = 'open' and due_on < p_as_of),
    'open', (select count(*) from t where status = 'open'),
    'on_hold', (select count(*) from t where status = 'on_hold'),
    'done_month', (select count(*) from done_month),
    'customers', (select count(*) from public.customers where organization_id = p_org and deleted_at is null),
    'consent_unknown', (select count(*) from public.customers where organization_id = p_org and deleted_at is null and contact_status = 'unknown'),
    'revisit_month', (
      select count(*) from done_month d
      where exists (select 1 from public.visits v where v.customer_id = d.customer_id
                    and v.visited_on > (d.completed_at at time zone 'Asia/Tokyo')::date
                    and v.visited_on <= (d.completed_at at time zone 'Asia/Tokyo')::date + 30)),
    'stores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'today', today, 'overdue', overdue, 'open', open, 'done_month', done_month) order by name)
      from per_store), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- 分析 — security invoker。「フォロー後30日以内に予約・来店の記録があった件数」であり因果関係は示さない
-- -----------------------------------------------------------------------------
create or replace function public.analytics_summary(p_org uuid, p_from date, p_to date, p_as_of date)
returns table (
  store_id uuid, store_name text, target_count bigint, done_count bigint, not_applicable_count bigint,
  overdue_count bigint, appointment_confirmed_count bigint, revisit_confirmed_count bigint
)
language sql stable security invoker set search_path = '' as $$
  with t as (
    select ft.*, (ft.completed_at at time zone 'Asia/Tokyo')::date as completed_on
    from public.followup_tasks ft
    where ft.organization_id = p_org and ft.due_on between p_from and p_to
  )
  select s.id, s.name,
    count(t.id),
    count(t.id) filter (where t.status = 'done'),
    count(t.id) filter (where t.status = 'not_applicable'),
    count(t.id) filter (where t.status = 'open' and t.due_on < p_as_of),
    count(t.id) filter (where t.status = 'done' and (
      exists (select 1 from public.appointments a where a.customer_id = t.customer_id and a.status <> 'cancelled'
              and a.created_at >= t.completed_at and a.created_at < t.completed_at + interval '30 days')
      or exists (select 1 from public.contact_logs l where l.task_id = t.id and l.outcome = 'appointment_reported'))),
    count(t.id) filter (where t.status = 'done' and exists (
      select 1 from public.visits v where v.customer_id = t.customer_id
        and v.visited_on > t.completed_on and v.visited_on <= t.completed_on + 30))
  from public.stores s
  left join t on t.store_id = s.id
  where s.organization_id = p_org
  group by s.id, s.name
  order by s.name;
$$;

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
revoke all on function public.platform_create_organization(text, text, text) from public, anon;
revoke all on function public.platform_set_organization_status(uuid, text) from public, anon;
revoke all on function public.platform_org_summaries() from public, anon;
revoke all on function public.platform_audit_logs(int) from public, anon;
revoke all on function public.anonymize_customer(uuid) from public, anon;
revoke all on function public.record_task_action(uuid, text, text, text, text, uuid, text) from public, anon;
revoke all on function public.dashboard_summary(uuid, date) from public, anon;
revoke all on function public.analytics_summary(uuid, date, date, date) from public, anon;

grant execute on function public.platform_create_organization(text, text, text) to authenticated, service_role;
grant execute on function public.platform_set_organization_status(uuid, text) to authenticated, service_role;
grant execute on function public.platform_org_summaries() to authenticated;
grant execute on function public.platform_audit_logs(int) to authenticated;
grant execute on function public.anonymize_customer(uuid) to authenticated;
grant execute on function public.record_task_action(uuid, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.dashboard_summary(uuid, date) to authenticated;
grant execute on function public.analytics_summary(uuid, date, date, date) to authenticated;

-- 以後 public スキーマに作られる関数は既定で anon から実行できないようにする
alter default privileges in schema public revoke execute on functions from public, anon;
