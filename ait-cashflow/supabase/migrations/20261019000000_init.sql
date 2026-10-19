-- A.I.T Cash Flow 初期スキーマ
-- すべての業務データは organization_id を持ち、RLS で企業ごとに分離する。
-- 子テーブルは (organization_id, id) の複合外部キーで「同じ企業の親」だけを参照できる。
-- 金額は円の整数（bigint）、日付は Asia/Tokyo の暦日（date）。

create schema if not exists app;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- 企業・メンバー
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  -- 企業全体で最低限残しておきたい現預金（資金予測の判定に使う）
  min_balance_jpy bigint not null default 0 check (min_balance_jpy between 0 and 1000000000000),
  -- 口座の基準残高がこの日数より古いと「未更新」と警告する
  stale_after_days int not null default 7 check (stale_after_days between 1 and 90),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'accountant', 'viewer')),
  -- 表示用（auth.users は RLS で読めないため、追加時にコピーする）
  email text,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- 店舗・口座・基準残高
-- ---------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- NULL = 本部（店舗に属さない）口座
  branch_id uuid,
  name text not null check (char_length(name) between 1 and 60),
  bank_name text check (char_length(bank_name) <= 60),
  kind text not null default 'bank' check (kind in ('bank', 'cash', 'other')),
  -- 口座番号は保存しない（識別用に下4桁だけ）
  number_last4 text check (number_last4 ~ '^[0-9]{4}$'),
  min_balance_jpy bigint not null default 0 check (min_balance_jpy between 0 and 1000000000000),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete set null (branch_id)
);
create index bank_accounts_branch_idx on public.bank_accounts (organization_id, branch_id);

create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bank_account_id uuid not null,
  -- この日の終わり時点の確定残高
  as_of_date date not null,
  balance_jpy bigint not null check (balance_jpy between -1000000000000 and 1000000000000),
  source text not null default 'manual' check (source in ('manual', 'csv', 'api')),
  note text check (char_length(note) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (bank_account_id, as_of_date),
  foreign key (organization_id, bank_account_id) references public.bank_accounts (organization_id, id) on delete cascade
);
create index balance_snapshots_account_date_idx on public.balance_snapshots (organization_id, bank_account_id, as_of_date desc);

-- ---------------------------------------------------------------------------
-- 繰返し設定・取引
-- ---------------------------------------------------------------------------

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bank_account_id uuid not null,
  branch_id uuid,
  direction text not null check (direction in ('in', 'out')),
  category text not null,
  amount_jpy bigint not null check (amount_jpy between 1 and 1000000000000),
  certainty text not null default 'fixed' check (certainty in ('fixed', 'expected')),
  counterparty text check (char_length(counterparty) <= 100),
  memo text check (char_length(memo) <= 500),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  interval_count int not null default 1 check (interval_count between 1 and 12),
  -- 毎月・毎年の日（31 は「月末」として扱い、短い月は末日に丸める）
  day_of_month int check (day_of_month between 1 and 31),
  -- 毎週の曜日（0=日曜 … 6=土曜）
  weekday int check (weekday between 0 and 6),
  month_of_year int check (month_of_year between 1 and 12),
  start_date date not null,
  end_date date,
  -- 土日に当たったとき：none=そのまま / previous=前の平日 / next=次の平日
  weekend_shift text not null default 'none' check (weekend_shift in ('none', 'previous', 'next')),
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (end_date is null or end_date >= start_date),
  check (frequency <> 'monthly' or day_of_month is not null),
  check (frequency <> 'weekly' or weekday is not null),
  check (frequency <> 'yearly' or (day_of_month is not null and month_of_year is not null)),
  check (category <> 'transfer'),
  foreign key (organization_id, bank_account_id) references public.bank_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete set null (branch_id)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bank_account_id uuid,
  -- 将来の外部連携（会計ソフト・銀行API）もここに source を追加して扱う
  source text not null check (source in ('bank_csv', 'accounting_csv', 'sales_csv', 'api')),
  file_name text check (char_length(file_name) <= 255),
  -- ファイルの SHA-256（同じファイルの再取込を防ぐ）
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  encoding text check (encoding in ('utf-8', 'shift_jis')),
  mapping jsonb not null default '{}'::jsonb,
  status text not null default 'previewed' check (status in ('previewed', 'committed', 'failed', 'canceled')),
  row_count int not null default 0,
  imported_count int not null default 0,
  duplicate_count int not null default 0,
  error_count int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, bank_account_id) references public.bank_accounts (organization_id, id) on delete set null (bank_account_id)
);
create unique index import_jobs_committed_file_uq on public.import_jobs (organization_id, file_hash) where status = 'committed';

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  import_job_id uuid not null,
  row_number int not null check (row_number >= 1),
  raw jsonb not null,
  parsed jsonb,
  row_hash text,
  status text not null check (status in ('valid', 'duplicate', 'error', 'imported', 'skipped')),
  error text check (char_length(error) <= 500),
  transaction_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (import_job_id, row_number),
  foreign key (organization_id, import_job_id) references public.import_jobs (organization_id, id) on delete cascade
);

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bank_account_id uuid not null,
  -- 店舗タグ（口座の店舗と違ってもよい：本部口座から店舗の家賃を払う場合など）
  branch_id uuid,
  direction text not null check (direction in ('in', 'out')),
  category text not null check (category in (
    'sales', 'receivable', 'loan_proceeds', 'other_in',
    'rent', 'payroll', 'purchase', 'tax', 'social_insurance', 'loan_principal', 'loan_interest', 'other_out',
    'transfer'
  )),
  -- 実際に動く現金の額（税込）
  amount_jpy bigint not null check (amount_jpy between 1 and 1000000000000),
  planned_date date,
  confirmed_date date,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'canceled')),
  -- fixed = 請求済・契約済など日付と金額が決まっているもの / expected = 売上見込みなど
  certainty text not null default 'fixed' check (certainty in ('fixed', 'expected')),
  counterparty text check (char_length(counterparty) <= 100),
  memo text check (char_length(memo) <= 500),
  transfer_group_id uuid,
  recurring_rule_id uuid,
  occurrence_date date,
  import_row_id uuid,
  -- CSV明細の重複防止キー（口座・日付・金額・向き・摘要の正規化ハッシュ＋同日同額の連番）
  dedupe_key text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, dedupe_key),
  -- 繰返しの同じ回を2度作らない
  unique (recurring_rule_id, occurrence_date),
  check (status <> 'planned' or planned_date is not null),
  check (status <> 'confirmed' or confirmed_date is not null),
  check ((category = 'transfer') = (transfer_group_id is not null)),
  -- 繰返しから作った回は何回目（日付）かを必ず持つ。繰返し設定を消しても回の日付は記録として残る
  check (recurring_rule_id is null or occurrence_date is not null),
  check (
    category = 'transfer'
    or (direction = 'in' and category in ('sales', 'receivable', 'loan_proceeds', 'other_in'))
    or (direction = 'out' and category in ('rent', 'payroll', 'purchase', 'tax', 'social_insurance', 'loan_principal', 'loan_interest', 'other_out'))
  ),
  foreign key (organization_id, bank_account_id) references public.bank_accounts (organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id) references public.branches (organization_id, id) on delete set null (branch_id),
  foreign key (organization_id, recurring_rule_id) references public.recurring_rules (organization_id, id) on delete set null (recurring_rule_id),
  foreign key (organization_id, import_row_id) references public.import_rows (organization_id, id) on delete set null (import_row_id)
);
create index cash_transactions_planned_idx on public.cash_transactions (organization_id, planned_date) where status = 'planned';
create index cash_transactions_confirmed_idx on public.cash_transactions (organization_id, bank_account_id, confirmed_date) where status = 'confirmed';
create index cash_transactions_transfer_idx on public.cash_transactions (transfer_group_id) where transfer_group_id is not null;

-- ---------------------------------------------------------------------------
-- 予測シナリオ・アラート・監査ログ
-- ---------------------------------------------------------------------------

create table public.forecast_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('conservative', 'standard', 'optimistic', 'custom')),
  name text not null check (char_length(name) between 1 and 40),
  -- 仮定（入金の遅れ日数・見込み入金の反映率など）。画面に必ず表示する
  assumptions jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index forecast_scenarios_kind_uq on public.forecast_scenarios (organization_id, kind) where kind <> 'custom';

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('shortfall', 'min_balance', 'large_payment', 'stale_data')),
  params jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('shortfall', 'min_balance', 'large_payment', 'stale_data')),
  -- 同じ内容のアラートを重ねて出さないためのキー（種類・対象日・対象口座など）
  dedupe_key text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  target_date date,
  amount_jpy bigint,
  message text not null check (char_length(message) <= 500),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  unique (organization_id, dedupe_key)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 権限の判定（RLS から使う）
-- ---------------------------------------------------------------------------

create or replace function app.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function app.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

grant execute on function app.is_member(uuid) to authenticated;
grant execute on function app.has_role(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- トリガー：更新日時・企業の付け替え禁止・振替の整合・最後のオーナー・監査ログ
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.forbid_org_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception '企業をまたいでデータを移すことはできません' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 振替は「同じ group の出金1件＋入金1件、同額・同じ状態・別の口座」でなければならない
create or replace function app.check_transfer_group() returns trigger
language plpgsql set search_path = '' as $$
declare
  g uuid := coalesce(new.transfer_group_id, old.transfer_group_id);
  n int; n_in int; n_out int; amounts int; statuses int; accounts int;
begin
  if g is null then return null; end if;
  select count(*), count(*) filter (where direction = 'in'), count(*) filter (where direction = 'out'),
         count(distinct amount_jpy), count(distinct status), count(distinct bank_account_id)
    into n, n_in, n_out, amounts, statuses, accounts
    from public.cash_transactions where transfer_group_id = g;
  if n = 0 then return null; end if;
  if n <> 2 or n_in <> 1 or n_out <> 1 or amounts <> 1 or statuses <> 1 or accounts <> 2 then
    raise exception '口座間振替は、別の口座どうしの同額の出金1件と入金1件で登録してください' using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function app.protect_last_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (
      select 1 from public.organization_members
      where organization_id = old.organization_id and role = 'owner' and user_id <> old.user_id
    ) and exists (select 1 from public.organizations where id = old.organization_id) then
      raise exception '最後のオーナーは削除・変更できません' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- 監査ログ（すべての変更を記録。RLS をバイパスして書き込むため security definer）
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  org := case when tg_table_name = 'organizations' then (rec ->> 'id')::uuid else (rec ->> 'organization_id')::uuid end;
  -- 企業ごと削除されるときは記録しない（監査ログも一緒に消えるため）
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = org) then
    return old;
  end if;
  insert into public.audit_logs (organization_id, actor_id, action, table_name, record_id, before, after)
  values (
    org,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'user_id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations', 'branches', 'bank_accounts', 'recurring_rules', 'cash_transactions', 'forecast_scenarios', 'alert_rules']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['organization_members', 'branches', 'bank_accounts', 'balance_snapshots', 'recurring_rules', 'cash_transactions',
                           'import_jobs', 'import_rows', 'forecast_scenarios', 'alert_rules', 'alerts']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function app.forbid_org_change()', t || '_org_lock', t);
  end loop;
  foreach t in array array['organizations', 'organization_members', 'branches', 'bank_accounts', 'balance_snapshots', 'recurring_rules',
                           'cash_transactions', 'import_jobs', 'forecast_scenarios', 'alert_rules']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit()', t || '_audit', t);
  end loop;
end;
$$;

create constraint trigger cash_transactions_transfer_check
  after insert or update or delete on public.cash_transactions
  deferrable initially deferred
  for each row execute function app.check_transfer_group();

create trigger organization_members_last_owner
  before update or delete on public.organization_members
  for each row execute function app.protect_last_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select on public.organizations for select to authenticated using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (app.has_role(id, array['owner'])) with check (app.has_role(id, array['owner']));
create policy organizations_delete on public.organizations for delete to authenticated using (app.has_role(id, array['owner']));

create policy members_select on public.organization_members for select to authenticated using (app.is_member(organization_id));
create policy members_update on public.organization_members for update to authenticated
  using (app.has_role(organization_id, array['owner'])) with check (app.has_role(organization_id, array['owner']));
create policy members_delete on public.organization_members for delete to authenticated
  using (app.has_role(organization_id, array['owner']) or user_id = auth.uid());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.has_role(organization_id, array['owner', 'accountant']));

do $$
declare t text;
begin
  foreach t in array array['branches', 'bank_accounts', 'balance_snapshots', 'recurring_rules', 'cash_transactions',
                           'import_jobs', 'import_rows', 'forecast_scenarios', 'alert_rules', 'alerts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.has_role(organization_id, array[''owner'', ''accountant'']))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.has_role(organization_id, array[''owner'', ''accountant''])) with check (app.has_role(organization_id, array[''owner'', ''accountant'']))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.has_role(organization_id, array[''owner'', ''accountant'']))', t || '_delete', t);
  end loop;
end;
$$;

-- 匿名ユーザーには何も見せない（RLS に加えて権限でも閉じる）
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert on public.organizations, public.organization_members from authenticated;

-- ---------------------------------------------------------------------------
-- 関数（RPC）
-- ---------------------------------------------------------------------------

-- 企業を作り、作った人をオーナーにする。標準のシナリオとアラート設定も作る
create or replace function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org uuid;
begin
  if uid is null then raise exception 'ログインが必要です' using errcode = '42501'; end if;
  if (select count(*) from public.organization_members where user_id = uid and role = 'owner') >= 5 then
    raise exception '作成できる企業は5社までです' using errcode = '54000';
  end if;
  insert into public.organizations (name, created_by) values (trim(p_name), uid) returning id into org;
  insert into public.organization_members (organization_id, user_id, role, email)
    values (org, uid, 'owner', (select email from auth.users where id = uid));
  insert into public.forecast_scenarios (organization_id, kind, name, assumptions, is_default) values
    (org, 'conservative', '保守', '{"fixedInflowDelayDays":7,"expectedInflowRate":0,"overdueInflow":"exclude","expectedOutflowRate":1.1}', false),
    (org, 'standard', '標準', '{"fixedInflowDelayDays":0,"expectedInflowRate":0.8,"overdueInflow":"delay7","expectedOutflowRate":1}', true),
    (org, 'optimistic', '楽観', '{"fixedInflowDelayDays":0,"expectedInflowRate":1,"overdueInflow":"tomorrow","expectedOutflowRate":1}', false);
  insert into public.alert_rules (organization_id, kind, params) values
    (org, 'shortfall', '{"withinDays":7}'),
    (org, 'min_balance', '{"withinDays":30}'),
    (org, 'large_payment', '{"withinDays":7,"ratioOfBalance":0.3}'),
    (org, 'stale_data', '{}');
  return org;
end;
$$;

-- 登録済みのユーザーをメールアドレスで企業に追加する（オーナーのみ）
create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  em text;
begin
  if not app.has_role(p_org, array['owner']) then
    raise exception 'メンバーを追加できるのはオーナーだけです' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'accountant', 'viewer') then
    raise exception '権限の指定が正しくありません' using errcode = '22023';
  end if;
  select id, email into target, em from auth.users where lower(email) = lower(trim(p_email));
  if target is null then
    raise exception 'このメールアドレスのユーザーが見つかりません（先にサインアップしてもらってください）' using errcode = 'P0002';
  end if;
  insert into public.organization_members (organization_id, user_id, role, email) values (p_org, target, p_role, em)
    on conflict (organization_id, user_id) do update set role = excluded.role;
  return target;
end;
$$;

revoke all on function public.create_organization(text) from public, anon;
revoke all on function public.add_member_by_email(uuid, text, text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.add_member_by_email(uuid, text, text) to authenticated;
