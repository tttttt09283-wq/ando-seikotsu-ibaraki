-- Enjoy Hand Management System（EHMS）Phase 1：経営管理の基盤
-- 本部システム（/hq）の中で動く。既存のテーブルは変更しない（名前はすべて ehms_ で始める）。
--
-- ・マスター：事業部・店舗・会計科目・設定
-- ・月次の数字：会計科目ごとの 実績（actual）／予算（budget）／予測（forecast）を分けて保存（金額は整数円）
-- ・月次締め：締めた月の実績は変更できない（締め解除は owner / accounting）
-- ・取り込み履歴・変更履歴（トリガーで自動）
-- ・権限：ehms_user_roles の役割（owner / gm / bm / store_manager / accounting / staff）と担当店舗で、行単位に制御（RLS）
--   ehms_user_roles に行がない人は、clinic_staff で role='admin' かつ salary_viewer の人だけ owner として扱う。
--   それ以外（院の共用アカウントなど）は、admin でも EHMS は見えない。

create extension if not exists pgcrypto;

-- ===== 権限 =====
create table if not exists public.ehms_user_roles (
  auth_uid    uuid primary key,
  name        text,
  role        text not null check (role in ('owner','gm','bm','store_manager','accounting','staff')),
  store_ids   uuid[] not null default '{}',
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create or replace function public.ehms_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r.role from public.ehms_user_roles r where r.auth_uid = auth.uid() and r.active),
    (select 'owner' from public.clinic_staff s where s.auth_uid = auth.uid() and s.role = 'admin' and s.salary_viewer limit 1)
  );
$$;

create or replace function public.ehms_store_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce((select r.store_ids from public.ehms_user_roles r where r.auth_uid = auth.uid() and r.active), '{}'::uuid[]);
$$;

-- 店舗の数字を見てよいか（store_id が null ＝ 本部・全社の行）
create or replace function public.ehms_can_read_store(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.ehms_role() in ('owner','gm','accounting') then true
    when public.ehms_role() in ('bm','store_manager') then sid is not null and sid = any(public.ehms_store_ids())
    else false end;
$$;

-- 店舗の数字を書いてよいか
create or replace function public.ehms_can_write_store(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.ehms_role() in ('owner','gm','accounting') then true
    when public.ehms_role() in ('bm','store_manager') then sid is not null and sid = any(public.ehms_store_ids())
    else false end;
$$;

-- ===== マスター =====
create table if not exists public.ehms_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.ehms_business_units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.ehms_stores (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  business_unit_id uuid references public.ehms_business_units(id),
  active           boolean not null default true,
  opened_on        date,
  closed_on        date,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       text
);

-- 区分：revenue 売上／cogs 売上原価／sga 販管費／non_op_income 営業外収益／non_op_expense 営業外費用
--       extra_gain 特別利益／extra_loss 特別損失／tax 法人税等
create table if not exists public.ehms_accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  section     text not null check (section in ('revenue','cogs','sga','non_op_income','non_op_expense','extra_gain','extra_loss','tax')),
  is_labor    boolean not null default false,  -- 人件費に入れる
  is_fixed    boolean not null default true,   -- 固定費（false＝変動費）。売上原価は常に変動費として扱う
  hq_only     boolean not null default false,  -- 本部の行だけで使う（院の行では使わない：二重計上の防止）
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- ===== 月次の数字 =====
create table if not exists public.ehms_monthly_records (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid references public.ehms_stores(id),   -- null ＝ 本部（全社共通の費用など）
  month          date not null check (extract(day from month) = 1),
  account_id     uuid not null references public.ehms_accounts(id),
  kind           text not null check (kind in ('actual','budget','forecast')),
  scenario       text not null default 'base',
  amount         bigint not null,                            -- 整数円
  source         text not null default 'manual' check (source in ('manual','import','sheet','system')),
  import_job_id  uuid,
  note           text,
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create unique index if not exists ehms_monthly_records_key on public.ehms_monthly_records
  (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), month, account_id, kind, scenario);
create index if not exists ehms_monthly_records_month on public.ehms_monthly_records (month);

-- 経営指標（新患数・延べ来院数・スタッフ数など、金額以外）
create table if not exists public.ehms_monthly_metrics (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid references public.ehms_stores(id),
  month          date not null check (extract(day from month) = 1),
  metric         text not null check (metric ~ '^[a-z][a-z0-9_]{1,40}$'),
  kind           text not null default 'actual' check (kind in ('actual','budget','forecast')),
  scenario       text not null default 'base',
  value          numeric not null,
  source         text not null default 'manual' check (source in ('manual','import','sheet','system')),
  import_job_id  uuid,
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create unique index if not exists ehms_monthly_metrics_key on public.ehms_monthly_metrics
  (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), month, metric, kind, scenario);

-- 月次締め（store_id null ＝ 全店舗まとめて締める）
create table if not exists public.ehms_month_closes (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid references public.ehms_stores(id),
  month      date not null check (extract(day from month) = 1),
  closed_at  timestamptz not null default now(),
  closed_by  text
);
create unique index if not exists ehms_month_closes_key on public.ehms_month_closes
  (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), month);

create or replace function public.ehms_month_closed(sid uuid, m date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ehms_month_closes c where c.month = m and (c.store_id is null or c.store_id = sid));
$$;

-- 取り込みの履歴（同じファイルを2回取り込んでも、数字は自然キーで上書きされるので重複しない。ファイルのハッシュで「取り込み済み」を知らせる）
create table if not exists public.ehms_import_jobs (
  id             uuid primary key default gen_random_uuid(),
  file_name      text,
  file_hash      text,
  target         text not null,
  rows_total     int not null default 0,
  rows_inserted  int not null default 0,
  rows_updated   int not null default 0,
  rows_skipped   int not null default 0,
  errors         jsonb not null default '[]'::jsonb,
  status         text not null default 'done',
  created_at     timestamptz not null default now(),
  created_by     text
);
create index if not exists ehms_import_jobs_hash on public.ehms_import_jobs (file_hash);

-- 変更履歴
create table if not exists public.ehms_audit_logs (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  before      jsonb,
  after       jsonb,
  actor       uuid,
  at          timestamptz not null default now()
);
create index if not exists ehms_audit_logs_at on public.ehms_audit_logs (at desc);

create or replace function public.ehms_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ehms_audit_logs (table_name, record_id, action, before, after, actor)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'key'),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

-- 更新のたびに version を上げ、更新日時を入れる
create or replace function public.ehms_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and to_jsonb(new) ? 'version' then new.version := coalesce(old.version, 1) + 1; end if;
  return new;
end $$;

-- 締めた月の実績は、締め解除しない限り変更できない
create or replace function public.ehms_guard_closed()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  r := coalesce(new, old);
  if r.kind = 'actual' and public.ehms_month_closed(r.store_id, r.month) then
    raise exception '締めた月（%）の実績は変更できません。締め解除してから修正してください', to_char(r.month, 'YYYY-MM');
  end if;
  if tg_op = 'UPDATE' and old.kind = 'actual' and public.ehms_month_closed(old.store_id, old.month) then
    raise exception '締めた月（%）の実績は変更できません', to_char(old.month, 'YYYY-MM');
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['ehms_monthly_records','ehms_monthly_metrics','ehms_stores','ehms_business_units','ehms_accounts','ehms_settings','ehms_month_closes','ehms_user_roles'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.ehms_audit()', t, t);
  end loop;
  foreach t in array array['ehms_monthly_records','ehms_monthly_metrics','ehms_stores','ehms_business_units','ehms_accounts','ehms_settings'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.ehms_touch()', t, t);
  end loop;
  foreach t in array array['ehms_monthly_records','ehms_monthly_metrics'] loop
    execute format('drop trigger if exists %I_closed on public.%I', t, t);
    execute format('create trigger %I_closed before insert or update or delete on public.%I for each row execute function public.ehms_guard_closed()', t, t);
  end loop;
end $$;

-- ===== 行単位のアクセス制御（RLS） =====
alter table public.ehms_user_roles      enable row level security;
alter table public.ehms_settings        enable row level security;
alter table public.ehms_business_units  enable row level security;
alter table public.ehms_stores          enable row level security;
alter table public.ehms_accounts        enable row level security;
alter table public.ehms_monthly_records enable row level security;
alter table public.ehms_monthly_metrics enable row level security;
alter table public.ehms_month_closes    enable row level security;
alter table public.ehms_import_jobs     enable row level security;
alter table public.ehms_audit_logs      enable row level security;

drop policy if exists ehms_user_roles_read on public.ehms_user_roles;
create policy ehms_user_roles_read on public.ehms_user_roles for select to authenticated
  using (auth_uid = auth.uid() or public.ehms_role() = 'owner');
drop policy if exists ehms_user_roles_write on public.ehms_user_roles;
create policy ehms_user_roles_write on public.ehms_user_roles for all to authenticated
  using (public.ehms_role() = 'owner') with check (public.ehms_role() = 'owner');

-- マスター：EHMS の役割がある人は読める。書けるのは owner / gm（科目は accounting も）
drop policy if exists ehms_settings_read on public.ehms_settings;
create policy ehms_settings_read on public.ehms_settings for select to authenticated using (public.ehms_role() is not null);
drop policy if exists ehms_settings_write on public.ehms_settings;
create policy ehms_settings_write on public.ehms_settings for all to authenticated
  using (public.ehms_role() = 'owner') with check (public.ehms_role() = 'owner');

drop policy if exists ehms_bu_read on public.ehms_business_units;
create policy ehms_bu_read on public.ehms_business_units for select to authenticated using (public.ehms_role() is not null);
drop policy if exists ehms_bu_write on public.ehms_business_units;
create policy ehms_bu_write on public.ehms_business_units for all to authenticated
  using (public.ehms_role() in ('owner','gm')) with check (public.ehms_role() in ('owner','gm'));

drop policy if exists ehms_stores_read on public.ehms_stores;
create policy ehms_stores_read on public.ehms_stores for select to authenticated using (public.ehms_role() is not null);
drop policy if exists ehms_stores_write on public.ehms_stores;
create policy ehms_stores_write on public.ehms_stores for all to authenticated
  using (public.ehms_role() in ('owner','gm')) with check (public.ehms_role() in ('owner','gm'));

drop policy if exists ehms_accounts_read on public.ehms_accounts;
create policy ehms_accounts_read on public.ehms_accounts for select to authenticated using (public.ehms_role() is not null);
drop policy if exists ehms_accounts_write on public.ehms_accounts;
create policy ehms_accounts_write on public.ehms_accounts for all to authenticated
  using (public.ehms_role() in ('owner','gm','accounting')) with check (public.ehms_role() in ('owner','gm','accounting'));

-- 月次の数字：担当店舗だけ。本部（store_id null）の行は owner / gm / accounting だけ
drop policy if exists ehms_records_read on public.ehms_monthly_records;
create policy ehms_records_read on public.ehms_monthly_records for select to authenticated using (public.ehms_can_read_store(store_id));
drop policy if exists ehms_records_write on public.ehms_monthly_records;
create policy ehms_records_write on public.ehms_monthly_records for all to authenticated
  using (public.ehms_can_write_store(store_id)) with check (public.ehms_can_write_store(store_id));

drop policy if exists ehms_metrics_read on public.ehms_monthly_metrics;
create policy ehms_metrics_read on public.ehms_monthly_metrics for select to authenticated using (public.ehms_can_read_store(store_id));
drop policy if exists ehms_metrics_write on public.ehms_monthly_metrics;
create policy ehms_metrics_write on public.ehms_monthly_metrics for all to authenticated
  using (public.ehms_can_write_store(store_id)) with check (public.ehms_can_write_store(store_id));

-- 締め：見るのは EHMS の役割がある人、締める・解除するのは owner / accounting
drop policy if exists ehms_closes_read on public.ehms_month_closes;
create policy ehms_closes_read on public.ehms_month_closes for select to authenticated using (public.ehms_role() is not null);
drop policy if exists ehms_closes_write on public.ehms_month_closes;
create policy ehms_closes_write on public.ehms_month_closes for all to authenticated
  using (public.ehms_role() in ('owner','accounting')) with check (public.ehms_role() in ('owner','accounting'));

drop policy if exists ehms_import_read on public.ehms_import_jobs;
create policy ehms_import_read on public.ehms_import_jobs for select to authenticated using (public.ehms_role() in ('owner','gm','accounting'));
drop policy if exists ehms_import_write on public.ehms_import_jobs;
create policy ehms_import_write on public.ehms_import_jobs for insert to authenticated with check (public.ehms_role() in ('owner','gm','accounting'));

-- 変更履歴：見るのは owner / gm。書き込みはトリガーだけ（利用者からは書けない）
drop policy if exists ehms_audit_read on public.ehms_audit_logs;
create policy ehms_audit_read on public.ehms_audit_logs for select to authenticated using (public.ehms_role() in ('owner','gm'));

revoke all on public.ehms_user_roles, public.ehms_settings, public.ehms_business_units, public.ehms_stores, public.ehms_accounts,
  public.ehms_monthly_records, public.ehms_monthly_metrics, public.ehms_month_closes, public.ehms_import_jobs, public.ehms_audit_logs from anon;
grant select, insert, update, delete on public.ehms_user_roles, public.ehms_settings, public.ehms_business_units, public.ehms_stores, public.ehms_accounts,
  public.ehms_monthly_records, public.ehms_monthly_metrics, public.ehms_month_closes to authenticated;
grant select, insert on public.ehms_import_jobs to authenticated;
grant select on public.ehms_audit_logs to authenticated;
revoke all on function public.ehms_role(), public.ehms_store_ids(), public.ehms_can_read_store(uuid), public.ehms_can_write_store(uuid), public.ehms_month_closed(uuid, date) from public, anon;
grant execute on function public.ehms_role(), public.ehms_store_ids(), public.ehms_can_read_store(uuid), public.ehms_can_write_store(uuid), public.ehms_month_closed(uuid, date) to authenticated;

-- ===== 初期データ（マスターだけ。金額のサンプルは入れない） =====
insert into public.ehms_business_units (name, sort) values ('整骨院事業', 1) on conflict (name) do nothing;

insert into public.ehms_stores (code, name, business_unit_id, sort)
select v.code, v.name, (select id from public.ehms_business_units where name = '整骨院事業'), v.sort
from (values ('HIRAKATA','枚方本院',1),('TAGUCHIYAMA','田口山院',2),('TSUDA','津田院',3),('KATANO','交野院',4),
             ('IBARAKI','茨木院',5),('OWADA','大和田院',6),('KORIEN','香里園院',7)) as v(code, name, sort)
on conflict (code) do nothing;

insert into public.ehms_accounts (code, name, section, is_labor, is_fixed, hq_only, sort) values
  ('R01','柔整保険窓口負担','revenue',false,false,false,101),('R02','柔整保険者請求','revenue',false,false,false,102),
  ('R03','鍼灸保険窓口負担','revenue',false,false,false,103),('R04','鍼灸保険者請求','revenue',false,false,false,104),
  ('R05','交通事故売上','revenue',false,false,false,105),('R06','労災売上','revenue',false,false,false,106),
  ('R07','骨格矯正','revenue',false,false,false,107),('R08','整体','revenue',false,false,false,108),
  ('R09','自費鍼灸','revenue',false,false,false,109),('R10','美容鍼','revenue',false,false,false,110),
  ('R11','EMS','revenue',false,false,false,111),('R12','巻き爪','revenue',false,false,false,112),
  ('R13','訪問鍼灸','revenue',false,false,false,113),('R14','回数券関連売上','revenue',false,false,false,114),
  ('R15','物販売上','revenue',false,false,false,115),('R16','その他売上','revenue',false,false,false,116),
  ('C01','商品仕入原価','cogs',false,false,false,201),('C02','施術材料費','cogs',false,false,false,202),
  ('C03','消耗材料費','cogs',false,false,false,203),('C04','外注原価','cogs',false,false,false,204),
  ('C05','その他直接原価','cogs',false,false,false,205),
  ('S01','基本給','sga',true,true,false,301),('S02','役職手当','sga',true,true,false,302),('S03','資格手当','sga',true,true,false,303),
  ('S04','その他手当','sga',true,true,false,304),('S05','残業代','sga',true,true,false,305),('S06','賞与','sga',true,true,false,306),
  ('S07','賞与引当相当額','sga',true,true,false,307),('S08','会社負担社会保険料','sga',true,true,false,308),
  ('S09','交通費','sga',false,true,false,309),('S10','福利厚生費','sga',false,true,false,310),('S11','家賃','sga',false,true,false,311),
  ('S12','水道光熱費','sga',false,true,false,312),('S13','通信費','sga',false,true,false,313),('S14','広告宣伝費','sga',false,true,false,314),
  ('S15','システム利用料','sga',false,true,false,315),('S16','リース料','sga',false,true,false,316),('S17','減価償却費','sga',false,true,false,317),
  ('S18','教育研修費','sga',false,true,false,318),('S19','採用費','sga',false,true,false,319),('S20','決済手数料','sga',false,false,false,320),
  ('S21','保険請求関連費','sga',false,false,false,321),('S22','修繕費','sga',false,true,false,322),('S23','本部管理費','sga',false,true,true,323),
  ('S24','その他経費','sga',false,true,false,324),
  ('N01','営業外収益','non_op_income',false,false,false,401),('N02','営業外費用','non_op_expense',false,false,false,402),
  ('X01','特別利益','extra_gain',false,false,false,501),('X02','特別損失','extra_loss',false,false,false,502),
  ('T01','法人税等','tax',false,false,true,601)
on conflict (code) do nothing;

insert into public.ehms_settings (key, value) values
  ('company', '{"name":"株式会社Enjoy Hand","brand":"あんど整骨院グループ","fiscal_start_month":7}'::jsonb),
  ('targets', '{"operating_margin":0.20,"labor_ratio":0.45,"utilization":0.80,"cash_months":6,"payback_months":36}'::jsonb),
  ('allocation', '{"method":"sales","manual":{}}'::jsonb),
  ('forecast', '{"method":"avg3"}'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
