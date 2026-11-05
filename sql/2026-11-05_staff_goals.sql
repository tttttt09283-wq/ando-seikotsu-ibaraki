-- 個人マンダラ・目標（KGI／KPI／KDI）
-- 見るのはスタッフ全員（is_staff）。書き込みは管理者と本人だけ。

create table if not exists public.staff_mandalas (
  staff_id   integer not null references public.clinic_staff (id) on delete cascade,
  year       integer not null check (year between 2020 and 2100),
  cells      jsonb not null default '[]'::jsonb,   -- [{cell:0〜8, title, memo}]（0＝中心の目標）
  updated_at timestamptz not null default now(),
  updated_by integer,
  primary key (staff_id, year)
);

create table if not exists public.staff_goals (
  id         bigserial primary key,
  staff_id   integer not null references public.clinic_staff (id) on delete cascade,
  year       integer not null check (year between 2020 and 2100),
  level      text not null check (level in ('KGI', 'KPI', 'KDI')),
  cell       smallint check (cell between 0 and 8),                        -- 紐づくマンダラのマス
  parent_id  bigint references public.staff_goals (id) on delete set null, -- KPI→KGI、KDI→KPI
  title      text not null check (char_length(title) between 1 and 200),
  metric     text not null default 'manual',                               -- manual 以外は個人サマリーから自動
  target     numeric,                                                      -- 月の目標
  unit       text not null default '',
  direction  text not null default 'up' check (direction in ('up', 'down')),
  results    jsonb not null default '{}'::jsonb,                           -- {"YYYY-MM": {actual, memo}}
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by integer
);
create index if not exists staff_goals_staff_year on public.staff_goals (staff_id, year);

-- 書き込めるのは管理者か本人
create or replace function public.can_edit_staff_goals(p_staff_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinic_staff me
     where me.auth_uid = auth.uid() and (me.role = 'admin' or me.id = p_staff_id)
  );
$$;

alter table public.staff_mandalas enable row level security;
alter table public.staff_goals enable row level security;

drop policy if exists staff_mandalas_read on public.staff_mandalas;
drop policy if exists staff_mandalas_write on public.staff_mandalas;
create policy staff_mandalas_read on public.staff_mandalas for select to authenticated using (public.is_staff());
create policy staff_mandalas_write on public.staff_mandalas for all to authenticated
  using (public.can_edit_staff_goals(staff_id)) with check (public.can_edit_staff_goals(staff_id));

drop policy if exists staff_goals_read on public.staff_goals;
drop policy if exists staff_goals_write on public.staff_goals;
create policy staff_goals_read on public.staff_goals for select to authenticated using (public.is_staff());
create policy staff_goals_write on public.staff_goals for all to authenticated
  using (public.can_edit_staff_goals(staff_id)) with check (public.can_edit_staff_goals(staff_id));

revoke all on function public.can_edit_staff_goals(integer) from public, anon;
grant execute on function public.can_edit_staff_goals(integer) to authenticated;
grant select, insert, update, delete on public.staff_mandalas, public.staff_goals to authenticated;
grant usage, select on sequence public.staff_goals_id_seq to authenticated;
