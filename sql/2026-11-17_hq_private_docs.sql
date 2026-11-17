-- 本部システム（/hq）：給与・人件費など、管理者の中でもさらに限られた人だけが見る台帳
-- hq_docs は role = 'admin' なら誰でも読めるため、共用アカウント（例：院の共用ID）に admin を付けていると給与が見えてしまう。
-- 給与まわりは別テーブルに分け、clinic_staff.salary_viewer = true の人だけが読み書きできるようにする。

alter table public.clinic_staff add column if not exists salary_viewer boolean not null default false;

create table if not exists public.hq_private_docs (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create or replace function public.is_salary_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.clinic_staff where auth_uid = auth.uid() and role = 'admin' and salary_viewer);
$$;

alter table public.hq_private_docs enable row level security;
drop policy if exists hq_private_docs_all on public.hq_private_docs;
create policy hq_private_docs_all on public.hq_private_docs for all to authenticated
  using (public.is_salary_viewer()) with check (public.is_salary_viewer());

revoke all on public.hq_private_docs from anon;
revoke all on function public.is_salary_viewer() from public, anon;
grant execute on function public.is_salary_viewer() to authenticated;
grant select, insert, update, delete on public.hq_private_docs to authenticated;

-- 給与を見てよい人だけに付ける（例）
-- update public.clinic_staff set salary_viewer = true where name = '氏名';
notify pgrst, 'reload schema';
