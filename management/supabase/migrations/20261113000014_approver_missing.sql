-- 退職・異動で承認する人がいなくなった申請を、社長・GMに知らせる（docs/test-plan.md §6「退職者」）
-- 振休は承認院の院長が承認する。その院に有効な院長がいなくなると、承認待ちのまま止まってしまうため
-- 振休→勤務の変更の GM 確認も、有効な GM がいなくなると止まるため同じく知らせる（社長は0人にできない：keep_one_president）
create or replace function mgmt.notify_missing_approvers() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v int;
begin
  for r in
    select s.id as step_id, st.name as store_name, u.name as user_name, 'leave' as kind
    from mgmt.approval_steps s
    join mgmt.leave_requests lr on lr.id = s.leave_request_id and lr.status = 'pending'
    join mgmt.stores st on st.id = s.approver_store_id
    join mgmt.users u on u.id = lr.user_id
    where s.status = 'pending' and s.step_kind = 'manager_final'
      and not exists (select 1 from mgmt.store_managers(s.approver_store_id))
    union all
    select s.id, st.name, u.name, 'holiday_change'
    from mgmt.approval_steps s
    join mgmt.holiday_change_requests hr on hr.id = s.holiday_change_request_id and hr.status = 'pending_gm'
    join mgmt.stores st on st.id = hr.store_id
    join mgmt.users u on u.id = hr.target_user_id
    where s.status = 'pending' and s.step_kind = 'gm_review'
      and not exists (select 1 from mgmt.users_with_global_role('GM'))
  loop
    v := mgmt.notify_many(array(select mgmt.users_with_global_role('PRESIDENT')) || array(select mgmt.users_with_global_role('GM')),
      'approver_missing',
      '承認する人がいない申請があります：' || r.store_name || ' ' || r.user_name || 'さんの' || case r.kind when 'leave' then '振休' else '振休→勤務の変更' end,
      case r.kind when 'leave' then 'この院に有効な院長がいません。院長を設定するか、申請を取り下げてもらってください'
        else '有効なGMがいません。GMを設定してください' end,
      '/approvals', 'approver_missing:' || r.step_id);
    n := n + v;
  end loop;
  return n;
end $$;

create or replace function mgmt.after_approver_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform mgmt.notify_missing_approvers();
  return null;
end $$;

-- 退職・停止（users.status）と、所属・役職の終了や変更のたびに確かめる
create trigger approver_missing_users after update of status on mgmt.users
  for each statement execute function mgmt.after_approver_change();
create trigger approver_missing_assignments after update or delete on mgmt.user_store_assignments
  for each statement execute function mgmt.after_approver_change();
create trigger approver_missing_roles after update or delete on mgmt.user_roles
  for each statement execute function mgmt.after_approver_change();

revoke execute on function mgmt.notify_missing_approvers(), mgmt.after_approver_change() from public, anon, authenticated;
grant execute on function mgmt.notify_missing_approvers() to service_role;

-- 集計（KPI）は関数の呼び出しが多く、PostgreSQL の JIT（実行時コンパイル）が動くと約1.5秒遅くなる。Supabase は既定で JIT が無効だが、環境によらないよう関数ごとに無効にする
alter function mgmt.store_kpis(date) set jit = off;
alter function mgmt.run_daily_jobs(boolean) set jit = off;
