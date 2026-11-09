-- 本番：新システムを取りやめる場合の戻し方（**データが消える。社長の承認なしに実行しない**）
-- 1) Vercel の新システムのプロジェクトを止める（画面からアクセスできなくする）
-- 2) 下の SQL で POS の表に足した列・トリガーと、mgmt スキーマを消す。POS の既存の列・データ・画面は元のまま動く
--    実行前に必ずバックアップを取る（docs/rollout.md §2）
begin;
drop trigger if exists mgmt_meetings_before_write on public.meetings;
drop trigger if exists mgmt_action_items_before_write on public.action_items;
alter table public.meetings drop constraint if exists meetings_minutes_status_check;
alter table public.meetings
  drop column if exists mgmt_store_id, drop column if exists minutes_due_at, drop column if exists minutes_status,
  drop column if exists minutes_submitted_at, drop column if exists minutes_submitted_late, drop column if exists no_decisions;
alter table public.action_items
  drop column if exists is_decision, drop column if exists owner_user_id, drop column if exists mgmt_store_id;
drop schema if exists mgmt cascade;
commit;
