-- 議事録の参加者の並び順を一定にする（院の所属者を名前順、そのあとに社外・他院の人）
-- PHASE 7 の get_meeting は参加者を登録順（内部の番号順）で返しており、保存のたびに順番が変わることがあった
create or replace function mgmt.get_meeting(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.meetings; v jsonb;
begin
  select * into m from public.meetings where id = p_id;
  if m.id is null or not mgmt.can_view_meeting(p_id) then return null; end if;
  select jsonb_build_object(
    'id', m.id, 'held_on', m.held_on, 'title', m.title, 'notes', m.notes, 'store_id', m.mgmt_store_id,
    'store_name', (select name from mgmt.stores where id = m.mgmt_store_id),
    'status', mgmt.meeting_status(m.held_on, m.minutes_submitted_at, m.minutes_status),
    'minutes_due_at', m.minutes_due_at, 'submitted_at', m.minutes_submitted_at, 'submitted_late', m.minutes_submitted_late,
    'no_decisions', m.no_decisions, 'can_edit', mgmt.can_edit_meeting(m.id), 'from_pos', m.created_by is not null and not exists (select 1 from mgmt.audit_logs l where l.table_name = 'meetings' and l.record_id = m.id::text and l.action = 'INSERT'),
    'minutes', (select jsonb_build_object('agenda', mm.agenda, 'content', mm.content, 'revision', mm.revision, 'updated_at', mm.updated_at,
                  'submitted_by_name', (select name from mgmt.users where id = mm.submitted_by)) from mgmt.meeting_minutes mm where mm.meeting_id = m.id),
    'attendees', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', coalesce(u.name, x.guest_name), 'guest', x.user_id is null) order by x.user_id is null, coalesce(u.name, x.guest_name), x.id)
                  from mgmt.meeting_attendees x left join mgmt.users u on u.id = x.user_id where x.meeting_id = m.id), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'detail', a.detail, 'owner_user_id', a.owner_user_id,
                  'owner_name', (select name from mgmt.users where id = a.owner_user_id), 'due_date', a.due_date, 'status', a.status,
                  'progress', a.progress, 'is_decision', a.is_decision) order by a.is_decision desc, a.id)
                  from public.action_items a where a.meeting_id = m.id), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object('revision', r.revision, 'submitted_at', r.submitted_at, 'late', r.late,
                  'submitted_by_name', (select name from mgmt.users where id = r.submitted_by)) order by r.revision)
                  from mgmt.meeting_minutes_revisions r where r.meeting_id = m.id), '[]'::jsonb)
  ) into v;
  return v;
end $$;
