-- EHMS Phase 2：人材・生産性の基盤と、既存シートからの取り込みの準備
-- 既存テーブルは壊さない（ehms_stores に列を足すだけ。データの削除はしない）。

-- ===== 店舗の別名（シートの院名「本院」「香里園院」「田口山分院」などと結びつける） =====
alter table public.ehms_stores add column if not exists aliases text[] not null default '{}';
update public.ehms_stores set aliases = v.a from (values
  ('HIRAKATA', array['本院','枚方本院','枚方']), ('TAGUCHIYAMA', array['田口山','田口山院','田口山分院']),
  ('TSUDA', array['津田','津田院']), ('KATANO', array['交野','交野院']), ('IBARAKI', array['茨木','茨木院']),
  ('OWADA', array['大和田','大和田院']), ('KORIEN', array['香里園','香里園院','香里園駅前院'])) as v(code, a)
where ehms_stores.code = v.code and ehms_stores.aliases = '{}';

-- ===== 日計表・年間予算からの取り込み用の科目 =====
-- 日計表の売上は「保険窓口＋自費合計＋物販＋請求額＝総売上」なので、この4つだけを取り込む（巻き爪・自賠は自費・窓口の内数なので取り込まない）
insert into public.ehms_accounts (code, name, section, is_labor, is_fixed, hq_only, sort) values
  ('R17','自費施術（日計表・内訳なし）','revenue',false,false,false,117),
  ('R18','保険窓口負担（日計表・柔整鍼灸計）','revenue',false,false,false,118),
  ('R19','保険者請求（日計表・柔整鍼灸計）','revenue',false,false,false,119),
  ('R90','売上予算（総額・内訳なし）','revenue',false,false,false,190)
on conflict (code) do nothing;

-- ===== 給与を見てよいか =====
alter table public.ehms_user_roles add column if not exists can_view_pay boolean not null default false;
create or replace function public.ehms_can_see_pay()
returns boolean language sql stable security definer set search_path = public as $$
  select public.ehms_role() = 'owner'
      or exists (select 1 from public.ehms_user_roles r where r.auth_uid = auth.uid() and r.active and r.can_view_pay);
$$;
revoke all on function public.ehms_can_see_pay() from public, anon;
grant execute on function public.ehms_can_see_pay() to authenticated;

-- ===== スタッフ（給与以外） =====
create table if not exists public.ehms_employees (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  store_id           uuid references public.ehms_stores(id),       -- null＝本部・未配属
  position           text,                                          -- 院長・副院長・施術者・時短施術者・施術者（ア）・受付 など
  employment_type    text,                                          -- 正社員・短時間正社員・アルバイト・パート など
  qualifications     text[] not null default '{}',                  -- 柔整・鍼灸 など
  fte                numeric,                                       -- 常勤換算（1＝常勤）
  monthly_work_days  numeric,
  monthly_work_hours numeric,
  treat_hours        numeric,                                       -- 月の施術可能時間（勤務−休憩・会議・教育・管理業務など）
  direct_sales       boolean not null default true,                 -- 直接売上で評価する人（院長・受付・本部などは false にできる）
  active             boolean not null default true,
  joined_on          date,
  left_on            date,
  note               text,
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         text
);

-- ===== 報酬（給与。見られるのは owner と can_view_pay の人だけ） =====
create table if not exists public.ehms_employee_pay (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.ehms_employees(id) on delete cascade,
  effective_from   date not null,                                   -- 適用開始日（改定しても過去は変えない）
  total_pay        bigint,                                          -- 月の支給合計（基本給・手当・通勤費など）
  base_salary      bigint,
  allowances       bigint,
  social_insurance bigint,                                          -- 会社負担の社会保険料（月）
  bonus_budget     bigint,                                          -- 賞与予算の月割
  commute          bigint,
  welfare          bigint,
  education        bigint,
  source           text not null default 'manual',
  note             text,
  version          int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       text,
  unique (employee_id, effective_from)
);

do $$
declare t text;
begin
  foreach t in array array['ehms_employees','ehms_employee_pay'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.ehms_audit()', t, t);
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.ehms_touch()', t, t);
  end loop;
end $$;

alter table public.ehms_employees enable row level security;
alter table public.ehms_employee_pay enable row level security;

-- スタッフ：その店舗の数字を見られる人は見られる（本部・未配属は owner / gm / accounting）。変更は owner / gm
drop policy if exists ehms_employees_read on public.ehms_employees;
create policy ehms_employees_read on public.ehms_employees for select to authenticated using (public.ehms_can_read_store(store_id));
drop policy if exists ehms_employees_write on public.ehms_employees;
create policy ehms_employees_write on public.ehms_employees for all to authenticated
  using (public.ehms_role() in ('owner','gm')) with check (public.ehms_role() in ('owner','gm'));

-- 報酬：owner と can_view_pay の人だけ（院長・BM・院の共用アカウントは見られない）
drop policy if exists ehms_pay_all on public.ehms_employee_pay;
create policy ehms_pay_all on public.ehms_employee_pay for all to authenticated
  using (public.ehms_can_see_pay()) with check (public.ehms_can_see_pay());

revoke all on public.ehms_employees, public.ehms_employee_pay from anon;
grant select, insert, update, delete on public.ehms_employees, public.ehms_employee_pay to authenticated;

-- ===== 既存の「スタッフ別の人件費」（hq_private_docs の labor）から初期登録 =====
-- 人件費（支給合計の平均）を報酬の total_pay に入れる。元のデータは消さない。
insert into public.ehms_employees (name, store_id, note, updated_by)
select p->>'name',
       (select s.id from public.ehms_stores s where (p->>'clinic') <> '' and ((p->>'clinic') = any(s.aliases) or s.name = (p->>'clinic')) limit 1),
       '本部システムの「スタッフ別の人件費」から登録', 'migration'
from public.hq_private_docs d, jsonb_array_elements(d.data->'people') p
where d.key = 'labor' and coalesce(p->>'name','') <> ''
  and not exists (select 1 from public.ehms_employees e where e.name = p->>'name');

insert into public.ehms_employee_pay (employee_id, effective_from, total_pay, source, note, updated_by)
select e.id, date '2026-08-01', round((p->>'avg')::numeric)::bigint, 'labor_doc',
       coalesce(p->>'note', '') || case when (p->>'est')::boolean then '（見込み額）' else '' end, 'migration'
from public.hq_private_docs d, jsonb_array_elements(d.data->'people') p
join public.ehms_employees e on e.name = p->>'name'
where d.key = 'labor' and nullif(p->>'avg','') is not null
on conflict (employee_id, effective_from) do nothing;

insert into public.ehms_settings (key, value) values
  ('staffing', '{"social_rate":0.155,"bonus_months":0,"max_per_day":15,"work_days":22,"utilization":0.8,"variable_rate":null}'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
