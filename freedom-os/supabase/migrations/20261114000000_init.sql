-- =====================================================================
-- FREEDOM OS 初期スキーマ
--  * すべての主要データに user_id（auth.users.id）を持たせ、RLS で本人の行だけ読み書きできる
--  * 金額は integer（円）で保持する
--  * 月次実績（business_revenue / business_expenses / clinic_metrics / ai_business_metrics /
--    household_finances）とシミュレーション（financial_scenarios / scenario_assumptions）は別テーブル
--  * 親子関係は (id, user_id) の複合外部キーで、他人の行にぶら下がれないようにする
-- =====================================================================

-- gen_random_uuid() は PostgreSQL 13 以降の標準関数（拡張は不要）

-- 共通：updated_at の自動更新
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  occupation text not null default '' check (char_length(occupation) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- user_settings（目標値・判定基準・税負担率など。すべて設定画面から変更可）
-- ---------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  employment_annual_income integer not null default 5500000 check (employment_annual_income >= 0),
  employment_monthly_takehome integer not null default 360000 check (employment_monthly_takehome >= 0),
  employment_weekly_hours numeric(5,1) not null default 45 check (employment_weekly_hours between 0 and 120),
  target_monthly_revenue integer not null default 1200000 check (target_monthly_revenue >= 0),
  target_clinic_revenue integer not null default 800000 check (target_clinic_revenue >= 0),
  target_ai_revenue integer not null default 400000 check (target_ai_revenue >= 0),
  target_annual_business_income integer not null default 12000000 check (target_annual_business_income >= 0),
  target_year integer not null default 2030 check (target_year between 2020 and 2100),
  independence_target_date date not null default date '2028-04-01',
  tax_social_rate numeric(5,4) not null default 0.30 check (tax_social_rate between 0 and 0.9),
  living_cost_monthly integer not null default 350000 check (living_cost_monthly >= 0),
  emergency_fund_months_min integer not null default 6 check (emergency_fund_months_min between 0 and 60),
  emergency_fund_months_target integer not null default 12 check (emergency_fund_months_target between 0 and 60),
  max_weekly_work_hours numeric(5,1) not null default 32 check (max_weekly_work_hours between 0 and 120),
  work_days_per_week integer not null default 4 check (work_days_per_week between 0 and 7),
  family_hours_weekly_target numeric(5,1) not null default 20 check (family_hours_weekly_target between 0 and 168),
  daily_available_minutes integer not null default 90 check (daily_available_minutes between 0 and 1440),
  weekly_discretionary_hours numeric(5,1) not null default 80 check (weekly_discretionary_hours between 0 and 168),
  core_values text[] not null default array['家族','自由','経済力','専門性','健康'],
  roadmap_start date not null default date '2026-11-01',
  roadmap_end date not null default date '2030-12-31',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- マンダラ（中心目標 + 8領域 = 9件 / 64行動）
-- ---------------------------------------------------------------------
create table public.mandala_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  position smallint not null check (position between 0 and 8), -- 0 = 中心目標、1..8 = A..H
  code text not null check (code in ('CENTER','A','B','C','D','E','F','G','H')),
  title text not null default '' check (char_length(title) <= 300),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, position),
  unique (user_id, code),
  unique (id, user_id)
);

create table public.mandala_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  goal_id uuid not null,
  position smallint not null check (position between 1 and 8),
  title text not null default '' check (char_length(title) <= 300),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 60),
  priority smallint not null default 2 check (priority between 1 and 3), -- 1 = 高
  due_date date,
  kpi_name text not null default '' check (char_length(kpi_name) <= 120),
  kpi_target numeric(14,2),
  kpi_actual numeric(14,2),
  kpi_unit text not null default '' check (char_length(kpi_unit) <= 20),
  kpi_direction text not null default 'higher' check (kpi_direction in ('higher','lower')),
  -- 実績値を月次実績から自動取得する場合の参照先（manual = 手入力）
  kpi_source text not null default 'manual',
  progress smallint not null default 0 check (progress between 0 and 100),
  status text not null default 'not_started' check (status in ('not_started','in_progress','achieved','missed')),
  completed_at date,
  memo text not null default '' check (char_length(memo) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, position),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.mandala_goals(id, user_id) on delete cascade
);
create index mandala_actions_user_idx on public.mandala_actions(user_id);

-- ---------------------------------------------------------------------
-- tasks（長期→年間→四半期→月間→週間→今日 の階層。マンダラ行動と ID で紐づく）
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mandala_action_id uuid,
  parent_id uuid,
  level text not null default 'week' check (level in ('long','year','quarter','month','week','day')),
  title text not null check (char_length(title) between 1 and 300),
  purpose text not null default '' check (char_length(purpose) <= 1000),
  start_date date,
  due_date date,
  estimate_minutes integer not null default 30 check (estimate_minutes between 0 and 100000),
  actual_minutes integer check (actual_minutes between 0 and 100000),
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'todo' check (status in ('todo','doing','done','blocked')),
  deliverable text not null default '' check (char_length(deliverable) <= 1000),
  done_criteria text not null default '' check (char_length(done_criteria) <= 1000),
  source text not null default 'manual' check (source in ('manual','generator','ai','import')),
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date),
  unique (id, user_id),
  foreign key (mandala_action_id, user_id) references public.mandala_actions(id, user_id) on delete set null (mandala_action_id),
  foreign key (parent_id, user_id) references public.tasks(id, user_id) on delete set null (parent_id)
);
create index tasks_user_due_idx on public.tasks(user_id, due_date);
create index tasks_action_idx on public.tasks(mandala_action_id);

create table public.task_dependencies (
  user_id uuid not null default auth.uid(),
  task_id uuid not null,
  depends_on_task_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (depends_on_task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  target_date date not null,
  target_amount integer check (target_amount >= 0),
  metric text not null default 'none',
  area_code text check (area_code in ('A','B','C','D','E','F','G','H')),
  status text not null default 'planned' check (status in ('planned','achieved','missed')),
  achieved_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 月次実績（month は月初日）
-- ---------------------------------------------------------------------
create table public.business_revenue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  business text not null check (business in ('clinic','ai')),
  category text not null check (category in ('treatment','initial','recurring','product','other')),
  amount integer not null default 0 check (amount >= 0),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, business, category)
);

create table public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  business text not null check (business in ('clinic','ai','common')),
  category text not null check (category in ('consumables','advertising','payment_fees','server','ai_api','outsourcing','rent','equipment','other')),
  amount integer not null default 0 check (amount >= 0),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, business, category)
);

-- 患者個人の情報（氏名・症状・施術記録）は保存しない。集計値のみ。
create table public.clinic_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  sessions integer check (sessions >= 0),
  new_patients integer check (new_patients >= 0),
  active_patients integer check (active_patients >= 0),
  cancellations integer check (cancellations >= 0),
  available_slots integer check (available_slots >= 0),
  work_days integer check (work_days between 0 and 31),
  inquiries integer check (inquiries >= 0),
  sns_inflow integer check (sns_inflow >= 0),
  referrals integer check (referrals >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table public.ai_business_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  new_contracts integer check (new_contracts >= 0),
  active_contracts integer check (active_contracts >= 0),
  churned_contracts integer check (churned_contracts >= 0),
  products_sold integer check (products_sold >= 0),
  maintenance_hours numeric(7,1) check (maintenance_hours >= 0),
  dev_hours numeric(7,1) check (dev_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table public.household_finances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  employment_income_net integer check (employment_income_net >= 0),
  other_income integer check (other_income >= 0),
  living_cost integer check (living_cost >= 0),
  emergency_fund_balance integer check (emergency_fund_balance >= 0),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

-- ---------------------------------------------------------------------
-- シミュレーション（実績とは別管理）
-- ---------------------------------------------------------------------
create table public.financial_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('conservative','standard','challenge')),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  start_month date not null check (extract(day from start_month) = 1),
  horizon_months integer not null default 36 check (horizon_months between 1 and 120),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind),
  unique (id, user_id)
);

create table public.scenario_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  scenario_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  value numeric(16,4) not null,
  updated_at timestamptz not null default now(),
  unique (scenario_id, key),
  foreign key (scenario_id, user_id) references public.financial_scenarios(id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- 独立判定の条件（7条件。基準値と手動確認の記録）
-- ---------------------------------------------------------------------
create table public.independence_criteria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null check (code in ('profit','emergency_fund','clinic_retention','ai_stability','preparation','work_hours','household')),
  enabled boolean not null default true,
  threshold numeric(14,2),
  threshold2 numeric(14,2),
  manual_confirmed boolean not null default false,
  note text not null default '' check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

-- ---------------------------------------------------------------------
-- 週間レビュー
-- ---------------------------------------------------------------------
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1), -- 月曜始まり
  clinic_revenue integer not null default 0 check (clinic_revenue >= 0),
  ai_revenue integer not null default 0 check (ai_revenue >= 0),
  new_customers integer not null default 0 check (new_customers >= 0),
  returning_customers integer not null default 0 check (returning_customers >= 0),
  ai_contracts integer not null default 0 check (ai_contracts >= 0),
  tasks_done integer not null default 0 check (tasks_done >= 0),
  work_hours numeric(5,1) not null default 0 check (work_hours between 0 and 168),
  family_hours numeric(5,1) not null default 0 check (family_hours between 0 and 168),
  wins text not null default '' check (char_length(wins) <= 4000),
  issues text not null default '' check (char_length(issues) <= 4000),
  next_focus text not null default '' check (char_length(next_focus) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------------------------------------------------------------------
-- AI 分析（入力に患者情報は含めない。入力の要約も保存し、何を送ったか確認できる）
-- ---------------------------------------------------------------------
create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weekly','monthly','gap','bottleneck','timing','time')),
  source text not null check (source in ('llm','rules')),
  model text not null default '',
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null,
  approved_action_indexes integer[] not null default '{}',
  created_at timestamptz not null default now()
);
create index ai_insights_user_idx on public.ai_insights(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 監査ログ（追記のみ。利用者からの更新・削除はできない）
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  table_name text not null,
  record_id text not null default '',
  action text not null check (action in ('insert','update','delete','import','export','restore','purge')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs(user_id, created_at desc);

-- updated_at トリガー
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','mandala_goals','mandala_actions','tasks','milestones',
    'business_revenue','business_expenses','clinic_metrics','ai_business_metrics','household_finances',
    'financial_scenarios','scenario_assumptions','independence_criteria','weekly_reviews']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- 主シナリオは1件だけ
create unique index financial_scenarios_one_primary on public.financial_scenarios(user_id) where is_primary;

-- ---------------------------------------------------------------------
-- RLS：すべてのテーブルで有効化し、本人の行だけ
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy profiles_own on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['user_settings','mandala_goals','mandala_actions','tasks','task_dependencies','milestones',
    'business_revenue','business_expenses','clinic_metrics','ai_business_metrics','household_finances',
    'financial_scenarios','scenario_assumptions','independence_criteria','weekly_reviews','ai_insights']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_own', t);
  end loop;
end $$;

alter table public.audit_logs enable row level security;
create policy audit_logs_select_own on public.audit_logs for select to authenticated using (user_id = (select auth.uid()));
create policy audit_logs_insert_own on public.audit_logs for insert to authenticated with check (user_id = (select auth.uid()));
-- update / delete のポリシーは作らない（= 誰も変更・削除できない。アカウント削除時のみ cascade で消える）

-- anon には一切権限を与えない
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update, delete on public.audit_logs from authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 新規ユーザー作成時に profile 行を作る（初期データ投入はアプリ側で「未登録のときだけ」行う）
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
