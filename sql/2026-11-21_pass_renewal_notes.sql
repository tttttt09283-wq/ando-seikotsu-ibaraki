-- 回数券・フリーパスの「未更新の理由」（適用済み）
-- 更新済みかどうかは画面で自動判定（同じ方があとで回数券・FPを買ったか）。ここには未更新の理由とメモだけを残す
create table if not exists public.pass_renewal_notes(
  pass_id integer primary key references public.passes(id) on delete cascade,
  reason text,
  memo text,
  updated_by integer,
  updated_at timestamptz not null default now()
);
alter table public.pass_renewal_notes enable row level security;
create policy pass_renewal_notes_staff_select on public.pass_renewal_notes for select using (is_staff());
create policy pass_renewal_notes_staff_insert on public.pass_renewal_notes for insert with check (is_staff());
create policy pass_renewal_notes_staff_update on public.pass_renewal_notes for update using (is_staff()) with check (is_staff());
create policy pass_renewal_notes_staff_delete on public.pass_renewal_notes for delete using (is_staff());
grant select, insert, update, delete on public.pass_renewal_notes to authenticated;
