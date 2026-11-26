-- 個人の振り返り報告（月の目標ボード）（適用済み）
create table if not exists public.staff_reflections(
  id bigserial primary key,
  staff_id integer not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  store_id integer not null default 1,
  good text, issue text, next_action text,
  self_score integer check (self_score between 1 and 5),
  status text not null default 'draft' check (status in ('draft','submitted','reviewed')),
  review_comment text, reviewed_by integer, reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by integer,
  unique(staff_id,month,store_id)
);
alter table public.staff_reflections enable row level security;
create policy staff_reflections_select on public.staff_reflections for select using (is_staff());
create policy staff_reflections_insert on public.staff_reflections for insert with check (is_staff());
create policy staff_reflections_update on public.staff_reflections for update using (is_staff()) with check (is_staff());
create policy staff_reflections_delete on public.staff_reflections for delete using (is_staff());
grant select, insert, update, delete on public.staff_reflections to authenticated;
grant usage, select on sequence public.staff_reflections_id_seq to authenticated;
