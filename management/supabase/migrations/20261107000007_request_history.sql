-- 申請の履歴（操作した人の名前つき）。申請を見られる人だけに返す
-- （院長は社長の利用者情報を直接は見られないため、履歴の名前は関数で返す）
create or replace function mgmt.request_history(p_kind text, p_request uuid)
returns table (id bigint, action text, reason text, reason_category text, self_approved boolean, occurred_at timestamptz, actor_name text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.action, e.reason, e.reason_category, e.self_approved, e.occurred_at, u.name
  from mgmt.approval_events e
  left join mgmt.users u on u.id = e.actor_user_id
  where e.request_kind = p_kind and e.request_id = p_request
    and case p_kind when 'leave' then mgmt.can_view_leave_request(p_request) when 'part_time' then mgmt.can_view_part_time(p_request) else false end
  order by e.id
$$;
revoke execute on function mgmt.request_history(text, uuid) from public, anon;
grant execute on function mgmt.request_history(text, uuid) to authenticated, service_role;
