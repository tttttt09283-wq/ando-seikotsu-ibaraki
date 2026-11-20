-- 株式会社Enejoy Hand 本部システム（/hq）の保存先
-- 本部が書く計画・台帳（出店計画・年間計画・教育・採用・経理事務・組織の役割など）を、項目ごとに1行の JSON で持つ。
-- 見る・書くのは管理者（clinic_staff.role = 'admin'）だけ。院のスタッフからは見えない。

create table if not exists public.hq_docs (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create or replace function public.is_hq()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.clinic_staff where auth_uid = auth.uid() and role = 'admin');
$$;

alter table public.hq_docs enable row level security;
drop policy if exists hq_docs_all on public.hq_docs;
create policy hq_docs_all on public.hq_docs for all to authenticated
  using (public.is_hq()) with check (public.is_hq());

revoke all on public.hq_docs from anon;
revoke all on function public.is_hq() from public, anon;
grant execute on function public.is_hq() to authenticated;
grant select, insert, update, delete on public.hq_docs to authenticated;
notify pgrst, 'reload schema';
