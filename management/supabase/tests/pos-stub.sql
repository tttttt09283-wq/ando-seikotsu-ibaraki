-- テスト・検証用：既存POS（public スキーマ）の会議まわりのテーブルを、本番と同じ形で再現する（データは入れない）
-- 本番には適用しない（本番には POS のテーブルがすでにある）。2026-11-09 時点の本番の列・制約・RLS に合わせている
create table if not exists public.stores (
  id serial primary key, name text not null, address text, tel text, email text, business_hours jsonb, memo text,
  active boolean default true, created_at timestamptz default now()
);
create table if not exists public.clinic_staff (
  id serial primary key, name text not null, email text not null, password text not null default '', role text default 'staff',
  auth_uid uuid, store_ids int[], line_user_id text, tier text, class_rank text, hire_date date, allowed_menus text[],
  lane_count int default 1, color text, initial text, event_only boolean default false
);
create table if not exists public.meetings (
  id bigserial primary key, held_on date not null default current_date, title text not null, notes text, store_id int,
  created_by int, created_at timestamptz not null default now(), photos jsonb not null default '[]'::jsonb
);
create table if not exists public.action_items (
  id bigserial primary key, title text not null, detail text, owner_staff_id int, due_date date,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default 'mid' check (priority in ('high','mid','low')),
  progress int not null default 0 check (progress >= 0 and progress <= 100), progress_note text,
  meeting_id bigint references public.meetings(id) on delete set null,
  source text not null default 'manual' check (source in ('manual','meeting','dashboard')),
  kpi text, store_id int, created_by int, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), done_at timestamptz
);
create table if not exists public.agenda_items (
  id bigserial primary key, title text not null, detail text, created_by int, created_by_name text,
  status text not null default 'open', meeting_id bigint, created_at timestamptz not null default now(), done_at timestamptz
);
create or replace function public.is_staff() returns boolean language sql stable security definer as $$
  select exists (select 1 from public.clinic_staff where auth_uid = auth.uid())
$$;
alter table public.meetings enable row level security;
alter table public.action_items enable row level security;
alter table public.agenda_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'meetings') then
    create policy staff_full_access_meetings on public.meetings for all to authenticated using (public.is_staff()) with check (public.is_staff());
    create policy staff_full_access_action_items on public.action_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
    create policy "agenda_items staff all" on public.agenda_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;
grant select, insert, update, delete on public.meetings, public.action_items, public.agenda_items to authenticated;
grant usage, select on all sequences in schema public to authenticated;
