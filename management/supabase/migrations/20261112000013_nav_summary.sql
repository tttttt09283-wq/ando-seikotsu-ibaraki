-- 画面上部のメニュー用：権限（どこかの院で持っているもの）と件数（承認待ち・未読・未確認の規定）を1回で返す
-- これまでは画面を開くたびに十数回の問い合わせをしていた（表示に約3秒）。1回にまとめて速くする
create or replace function mgmt.my_nav() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'perms', coalesce((select jsonb_agg(p.code order by p.code) from mgmt.permissions p where mgmt.can_anywhere(p.code)), '[]'::jsonb),
    'approvals', (select count(*) from mgmt.my_approval_queue())
               + (select count(*) from mgmt.my_part_time_queue())
               + (select count(*) from mgmt.my_holiday_change_queue())
               + (select count(*) from mgmt.my_rule_queue()),
    'unread', (select count(*) from mgmt.notifications n where n.user_id = mgmt.current_user_id() and n.read_at is null),
    'unack_rules', (select count(*) from mgmt.my_unacknowledged_rules())
  )
  where mgmt.current_user_id() is not null
$$;
revoke execute on function mgmt.my_nav() from public, anon;
grant execute on function mgmt.my_nav() to authenticated;
