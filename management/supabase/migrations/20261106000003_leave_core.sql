-- AND GROUP MANAGEMENT SYSTEM — PHASE 3：休暇残数（台帳方式）・年5日・CSV移行
-- 設計：docs/leave-management.md・docs/database.md §4.5
--
-- ・残数は直接書き換えない。付与（leave_grants）・取得（leave_usage）・調整（leave_adjustments）から計算する
-- ・計算は DB 関数 mgmt.leave_balance()／mgmt.five_day_status() に一本化（画面・ダッシュボード・承認で共通に使う）
-- ・書き込みは RPC 関数のみ（テーブルへの直接 INSERT/UPDATE は authenticated に許可しない）

-- ===== 区分・制度 =====
create table mgmt.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('PAID','SHIFT','SHIFT_HOLIDAY','COMP')),
  name text not null,
  group_name text not null,          -- 有給／振替休日／代休（画面の合計の単位）
  display_order int not null
);

create table mgmt.leave_policies (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references mgmt.leave_types(id),
  valid_from date not null,          -- 制度の適用開始日（変更の履歴を残す）
  grant_basis text check (grant_basis in ('hire_date','fixed_date')),   -- 有給の付与基準（Q-12：入社日基準）
  fixed_grant_month_day text check (fixed_grant_month_day is null or fixed_grant_month_day ~ '^\d{2}-\d{2}$'),
  expiry_rule text not null check (expiry_rule in ('months','end_of_origin_month')),
  validity_months int check (validity_months is null or validity_months between 1 and 60),
  on_expiry text not null check (on_expiry in ('lapse','alert_only')),
  half_day_allowed boolean not null default false,   -- Q-3（未確定：初期は不可）
  hourly_allowed boolean not null default false,     -- Q-3（未確定：初期は不可）
  hours_per_day numeric(4,2),
  consume_order text not null default 'fifo_expiry' check (consume_order in ('fifo_expiry')),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (leave_type_id, valid_from),
  check (expiry_rule <> 'months' or validity_months is not null)
);

-- ===== 付与 =====
create table mgmt.leave_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mgmt.users(id),
  leave_type_id uuid not null references mgmt.leave_types(id),
  grant_date date not null,                -- 付与日（振休は出勤した日）
  expires_on date not null,                -- この日まで使える
  days numeric(5,2) not null check (days > 0 and days <= 40 and days * 2 = floor(days * 2)),
  source text not null check (source in ('statutory','company','migration','shift_earned','comp_earned','manual')),
  counts_toward_5day boolean not null default false,   -- 年5日義務の対象（1回の付与が10日以上）
  prior_taken_in_period numeric(5,2) not null default 0 check (prior_taken_in_period >= 0),  -- 移行前に今の期間で取得済みの日数（年5日用）
  origin_work_date date,                    -- 振休・代休の元になった出勤日
  import_batch_id uuid,
  note text check (note is null or length(note) <= 300),
  voided_at timestamptz,                    -- 取消（CSV取り込みの取消など）。計算から外す
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  check (expires_on >= grant_date),
  check ((voided_at is null) = (voided_by is null))
);
create index on mgmt.leave_grants (user_id, leave_type_id) where voided_at is null;

-- ===== 取得（予定・実績）。PHASE 4 で申請（leave_requests）と結びつける =====
create table mgmt.leave_usage (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid,                    -- PHASE 4 で外部キーを追加
  leave_grant_id uuid not null references mgmt.leave_grants(id),
  user_id uuid not null references mgmt.users(id),
  leave_type_id uuid not null references mgmt.leave_types(id),
  usage_date date not null,
  days numeric(5,2) not null check (days > 0 and days <= 1),
  hours numeric(4,2),
  status text not null check (status in ('planned','taken','cancelled')),
  counts_toward_5day boolean not null default true,    -- 時間単位は false
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index on mgmt.leave_usage (leave_grant_id) where status <> 'cancelled';
-- 同じ人・同じ日・同じ区分グループの有効な取得の重複を防ぐ（半日2回は PHASE 4 で区別する）
create index on mgmt.leave_usage (user_id, usage_date) where status <> 'cancelled';

-- ===== 調整（理由必須） =====
create table mgmt.leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  leave_grant_id uuid not null references mgmt.leave_grants(id),
  user_id uuid not null references mgmt.users(id),
  delta_days numeric(5,2) not null check (delta_days <> 0 and delta_days * 2 = floor(delta_days * 2)),
  reason text not null check (length(btrim(reason)) between 2 and 300),
  adjusted_by uuid not null,
  adjusted_at timestamptz not null default now()
);

-- ===== CSV 取り込み =====
create table mgmt.import_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('staff','leave_balance')),
  file_name text not null,
  status text not null default 'validated' check (status in ('validated','imported','rolled_back','failed')),
  row_count int not null default 0,
  error_count int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  executed_by uuid,
  executed_at timestamptz,
  rolled_back_by uuid,
  rolled_back_at timestamptz,
  note text
);
create table mgmt.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references mgmt.import_batches(id),
  row_no int not null,
  data jsonb not null,          -- 検証・正規化した値
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  result text,                  -- 取り込み結果（作成した付与ID、スタッフ登録の結果など）
  unique (batch_id, row_no)
);
alter table mgmt.leave_grants add constraint leave_grants_import_batch_fk foreign key (import_batch_id) references mgmt.import_batches(id);

create trigger audit after insert or update or delete on mgmt.leave_policies for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.leave_grants for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.leave_usage for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.leave_adjustments for each row execute function mgmt.audit_trigger();
create trigger audit after insert or update or delete on mgmt.import_batches for each row execute function mgmt.audit_trigger();

-- 調整は追記のみ（取り消すときは逆の調整を入れる）
create trigger forbid_change before update or delete on mgmt.leave_adjustments for each row execute function mgmt.forbid_change();

-- ===== 区分・制度の初期値（Q-2・Q-12 の決定を反映。半日・時間単位は未確定のため不可） =====
insert into mgmt.leave_types (code, name, group_name, display_order) values
  ('PAID', '有給休暇', '有給', 1),
  ('SHIFT', '振替（公休出勤）', '振替休日', 2),
  ('SHIFT_HOLIDAY', '祝振替（祝日出勤）', '振替休日', 3),
  ('COMP', '代休', '代休', 4);

insert into mgmt.leave_policies (leave_type_id, valid_from, grant_basis, expiry_rule, validity_months, on_expiry, note)
select id, date '2000-01-01',
  case code when 'PAID' then 'hire_date' end,
  case code when 'PAID' then 'months' when 'COMP' then 'months' else 'end_of_origin_month' end,
  case code when 'PAID' then 24 when 'COMP' then 1 end,
  case code when 'PAID' then 'lapse' else 'alert_only' end,
  case code
    when 'PAID' then '入社日基準（Q-12）。有効期限は付与日から2年（時効）'
    when 'COMP' then '代休の運用は未確定（Q-11）。仮の設定'
    else '出勤した月の末日までに取得。期限後も失効させずアラート（Q-2）' end
from mgmt.leave_types;

-- ===== 計算 =====
-- その区分の、その日時点の制度
create or replace function mgmt.leave_policy_at(p_type uuid, p_date date) returns mgmt.leave_policies
language sql stable security definer set search_path = '' as $$
  select * from mgmt.leave_policies where leave_type_id = p_type and valid_from <= p_date order by valid_from desc limit 1
$$;

-- 付与日と制度から有効期限を決める（有給：付与日から24か月後の前日、振休：出勤した月の末日）
create or replace function mgmt.expiry_for(p_type uuid, p_grant_date date) returns date
language plpgsql stable security definer set search_path = '' as $$
declare pol mgmt.leave_policies;
begin
  pol := mgmt.leave_policy_at(p_type, p_grant_date);
  if pol.id is null then raise exception '休暇の制度が設定されていません'; end if;
  if pol.expiry_rule = 'end_of_origin_month' then
    return (date_trunc('month', p_grant_date) + interval '1 month - 1 day')::date;
  end if;
  return (p_grant_date + make_interval(months => pol.validity_months) - interval '1 day')::date;
end $$;

-- 見られる人か（本人／その人が所属する院で leave.view.store を持つ人）
create or replace function mgmt.can_view_leave_of(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = mgmt.current_user_id()
    or mgmt.can('leave.view.store')
    or exists (
      select 1 from mgmt.user_store_assignments a
      where a.user_id = p_user and mgmt.is_current(a.starts_on, a.ends_on) and mgmt.can('leave.view.store', a.store_id)
    )
$$;

-- 付与ごとの残り（その日時点）
create or replace function mgmt.leave_grant_state(p_user uuid, p_type uuid, p_as_of date default mgmt.jst_today())
returns table (
  grant_id uuid, grant_date date, expires_on date, source text, days numeric, adjusted numeric,
  taken numeric, planned numeric, remaining numeric, state text   -- state: active／expired_lapsed／expired_alert／future
)
language sql stable security definer set search_path = '' as $$
  select g.id, g.grant_date, g.expires_on, g.source, g.days,
    coalesce((select sum(a.delta_days) from mgmt.leave_adjustments a where a.leave_grant_id = g.id), 0),
    coalesce((select sum(u.days) from mgmt.leave_usage u where u.leave_grant_id = g.id and u.status = 'taken'), 0),
    coalesce((select sum(u.days) from mgmt.leave_usage u where u.leave_grant_id = g.id and u.status = 'planned'), 0),
    g.days
      + coalesce((select sum(a.delta_days) from mgmt.leave_adjustments a where a.leave_grant_id = g.id), 0)
      - coalesce((select sum(u.days) from mgmt.leave_usage u where u.leave_grant_id = g.id and u.status in ('taken','planned')), 0),
    case
      when g.grant_date > p_as_of then 'future'
      when g.expires_on >= p_as_of then 'active'
      when (mgmt.leave_policy_at(g.leave_type_id, g.grant_date)).on_expiry = 'alert_only' then 'expired_alert'
      else 'expired_lapsed'
    end
  from mgmt.leave_grants g
  where g.user_id = p_user and g.leave_type_id = p_type and g.voided_at is null
    and mgmt.can_view_leave_of(p_user)   -- 見る権限のない人の付与は返さない
  order by g.expires_on, g.grant_date
$$;

-- 残数の集計（docs/leave-management.md §3 の式）
--   現在残数 = 付与 + 調整 − 取得済み（有効な付与のみ）
--   取得予定反映後 = 現在残数 − 承認済み取得予定
--   申請中は PHASE 4 で追加（今は 0）
create or replace function mgmt.leave_balance(p_user uuid, p_type_code text, p_as_of date default mgmt.jst_today())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_type uuid;
  r jsonb;
begin
  if not mgmt.can_view_leave_of(p_user) then
    raise exception 'この人の休暇を見る権限がありません' using errcode = '42501';
  end if;
  select id into v_type from mgmt.leave_types where code = p_type_code;
  if v_type is null then raise exception '休暇の区分が正しくありません'; end if;
  with s as (select * from mgmt.leave_grant_state(p_user, v_type, p_as_of)),
  live as (select * from s where state in ('active','expired_alert'))
  select jsonb_build_object(
    'type', p_type_code,
    'as_of', p_as_of,
    'granted', coalesce((select sum(days) from live), 0),
    'adjusted', coalesce((select sum(adjusted) from live), 0),
    'taken', coalesce((select sum(taken) from live), 0),
    'planned', coalesce((select sum(planned) from live), 0),
    'pending', 0,
    'current', coalesce((select sum(days + adjusted - taken) from live), 0),
    'after_planned', coalesce((select sum(remaining) from live), 0),
    'lapsed', coalesce((select sum(greatest(remaining, 0)) from s where state = 'expired_lapsed'), 0),
    'overdue', coalesce((select sum(greatest(remaining, 0)) from s where state = 'expired_alert'), 0),
    'overdue_since', (select min(expires_on) from s where state = 'expired_alert' and remaining > 0),
    'next_expiry_date', (select min(expires_on) from s where state = 'active' and remaining > 0),
    'next_expiry_days', coalesce((select sum(remaining) from s where state = 'active' and remaining > 0
                          and expires_on = (select min(expires_on) from s where state = 'active' and remaining > 0)), 0),
    'grants', coalesce((select jsonb_agg(to_jsonb(s.*) order by s.expires_on, s.grant_date) from s), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- 年5日取得義務（docs/leave-management.md §5）
--   対象：1回の付与が10日以上の有給。期間：付与日〜1年後の前日
--   算入：期間内の取得（全日・半日。時間単位は除く）。どの付与から使ったかは問わない。移行前の取得（prior_taken_in_period）を足す
create or replace function mgmt.five_day_status(p_user uuid, p_as_of date default mgmt.jst_today())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g record;
  v_end date;
  v_taken numeric;
  v_planned numeric;
  v_left_days int;
  v_total_days int;
  v_level text;
begin
  if not mgmt.can_view_leave_of(p_user) then
    raise exception 'この人の休暇を見る権限がありません' using errcode = '42501';
  end if;
  select lg.* into g from mgmt.leave_grants lg join mgmt.leave_types t on t.id = lg.leave_type_id and t.code = 'PAID'
  where lg.user_id = p_user and lg.voided_at is null and lg.counts_toward_5day
    and lg.grant_date <= p_as_of and p_as_of < (lg.grant_date + interval '1 year')::date
  order by lg.grant_date desc limit 1;
  if g.id is null then
    return jsonb_build_object('target', false);
  end if;
  v_end := ((g.grant_date + interval '1 year')::date - 1);
  select coalesce(sum(u.days) filter (where u.status = 'taken'), 0), coalesce(sum(u.days) filter (where u.status = 'planned'), 0)
    into v_taken, v_planned
  from mgmt.leave_usage u join mgmt.leave_types t on t.id = u.leave_type_id and t.code = 'PAID'
  where u.user_id = p_user and u.counts_toward_5day and u.usage_date between g.grant_date and v_end;
  v_taken := v_taken + g.prior_taken_in_period;
  v_left_days := v_end - p_as_of;
  v_total_days := v_end - g.grant_date + 1;
  v_level := case
    when v_taken >= 5 then 'done'
    when v_taken + v_planned >= 5 then 'planned_ok'
    when v_left_days <= 31 then 'urgent'      -- 期間の残りが1か月以下
    when v_left_days <= 92 then 'warning'     -- 3か月以下
    when v_left_days <= 183 and (v_taken + v_planned) < 5.0 * (v_total_days - v_left_days) / v_total_days then 'caution'  -- 6か月以下で経過割合に届かない
    else 'ok' end;
  return jsonb_build_object(
    'target', true, 'base_date', g.grant_date, 'period_start', g.grant_date, 'period_end', v_end,
    'required', 5, 'taken', v_taken, 'planned', v_planned, 'remaining_required', greatest(5 - v_taken, 0),
    'days_left', v_left_days, 'level', v_level
  );
end $$;

-- ===== 書き込み（RPC のみ） =====
-- 手動の付与（法定付与の確定・会社独自・振休の発生）。社長（leave.adjust）
create or replace function mgmt.add_leave_grant(
  p_user uuid, p_type_code text, p_grant_date date, p_days numeric, p_source text,
  p_origin_work_date date default null, p_note text default null, p_prior_taken numeric default 0
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_type uuid; v_id uuid;
begin
  if not mgmt.can('leave.adjust') then raise exception '休暇を付与する権限がありません' using errcode = '42501'; end if;
  select id into v_type from mgmt.leave_types where code = p_type_code;
  if v_type is null then raise exception '休暇の区分が正しくありません'; end if;
  if p_source not in ('statutory','company','shift_earned','comp_earned','manual') then raise exception '付与の種類が正しくありません'; end if;
  if p_type_code in ('SHIFT','SHIFT_HOLIDAY') and p_origin_work_date is null then raise exception '振休には出勤した日が必要です'; end if;
  insert into mgmt.leave_grants (user_id, leave_type_id, grant_date, expires_on, days, source, counts_toward_5day, prior_taken_in_period, origin_work_date, note, created_by)
  values (p_user, v_type, p_grant_date, mgmt.expiry_for(v_type, p_grant_date), p_days, p_source,
          p_type_code = 'PAID' and p_days >= 10, coalesce(p_prior_taken, 0), p_origin_work_date, nullif(btrim(p_note), ''), mgmt.current_user_id())
  returning id into v_id;
  return v_id;
end $$;

-- 残数の修正（理由・修正者・日時を記録）。社長（leave.adjust）
create or replace function mgmt.adjust_leave(p_grant uuid, p_delta numeric, p_reason text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare g mgmt.leave_grants; v_id uuid; v_remaining numeric;
begin
  if not mgmt.can('leave.adjust') then raise exception '残数を修正する権限がありません' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '修正理由を入力してください'; end if;
  select * into g from mgmt.leave_grants where id = p_grant and voided_at is null;
  if g.id is null then raise exception '付与が見つかりません'; end if;
  perform pg_advisory_xact_lock(hashtextextended(g.user_id::text || g.leave_type_id::text, 0));
  select remaining into v_remaining from mgmt.leave_grant_state(g.user_id, g.leave_type_id) where grant_id = p_grant;
  if v_remaining + p_delta < 0 then raise exception 'この修正で残りがマイナスになります（今の残り %）', v_remaining; end if;
  insert into mgmt.leave_adjustments (leave_grant_id, user_id, delta_days, reason, adjusted_by)
  values (p_grant, g.user_id, p_delta, btrim(p_reason), mgmt.current_user_id()) returning id into v_id;
  return v_id;
end $$;

-- CSV取り込み：検証済みの行から付与を作る（1トランザクション。途中で失敗したら全部取り消し）
create or replace function mgmt.import_commit(p_batch uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare b mgmt.import_batches; r record; v_type uuid; v_user uuid; v_id uuid; n int := 0;
begin
  if not mgmt.can('leave.import') then raise exception 'CSVを取り込む権限がありません' using errcode = '42501'; end if;
  select * into b from mgmt.import_batches where id = p_batch for update;
  if b.id is null then raise exception '取り込みデータが見つかりません'; end if;
  if b.kind <> 'leave_balance' then raise exception 'この取り込みは残数のデータではありません'; end if;
  if b.status <> 'validated' then raise exception 'この取り込みはすでに実行済み、または取り消し済みです'; end if;
  if b.error_count > 0 or exists (select 1 from mgmt.import_rows where batch_id = p_batch and jsonb_array_length(errors) > 0) then
    raise exception 'エラーのある行があるため取り込めません';
  end if;
  for r in select * from mgmt.import_rows where batch_id = p_batch order by row_no loop
    select id into v_type from mgmt.leave_types where code = r.data ->> 'type_code';
    select id into v_user from mgmt.users where staff_code = r.data ->> 'staff_code';
    if v_type is null or v_user is null then raise exception '%行目：スタッフまたは区分が見つかりません', r.row_no; end if;
    if (r.data ->> 'remaining')::numeric = 0 then
      update mgmt.import_rows set result = '残数0のため付与なし' where id = r.id;
      continue;
    end if;
    insert into mgmt.leave_grants (user_id, leave_type_id, grant_date, expires_on, days, source, counts_toward_5day, prior_taken_in_period, origin_work_date, import_batch_id, note, created_by)
    values (v_user, v_type, (r.data ->> 'grant_date')::date, (r.data ->> 'expires_on')::date, (r.data ->> 'remaining')::numeric, 'migration',
            coalesce((r.data ->> 'counts_toward_5day')::boolean, false), coalesce((r.data ->> 'prior_taken')::numeric, 0),
            case when r.data ->> 'type_code' in ('SHIFT','SHIFT_HOLIDAY') then (r.data ->> 'grant_date')::date end,
            p_batch, '移行時点の残数', mgmt.current_user_id())
    returning id into v_id;
    update mgmt.import_rows set result = v_id::text where id = r.id;
    n := n + 1;
  end loop;
  update mgmt.import_batches set status = 'imported', executed_by = mgmt.current_user_id(), executed_at = now() where id = p_batch;
  return n;
end $$;

-- 取り込みの取り消し（作った付与を取消扱いに。取り込み後に取得・調整があった付与があれば取り消せない）
create or replace function mgmt.import_rollback(p_batch uuid, p_reason text) returns int
language plpgsql security invoker set search_path = '' as $$
declare b mgmt.import_batches; n int;
begin
  if not mgmt.can('leave.import') then raise exception 'CSVの取り込みを取り消す権限がありません' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 2 then raise exception '取り消す理由を入力してください'; end if;
  select * into b from mgmt.import_batches where id = p_batch for update;
  if b.id is null or b.status <> 'imported' then raise exception '取り消せるのは取り込み済みのデータだけです'; end if;
  if exists (
    select 1 from mgmt.leave_grants g where g.import_batch_id = p_batch and g.voided_at is null and (
      exists (select 1 from mgmt.leave_usage u where u.leave_grant_id = g.id and u.status <> 'cancelled')
      or exists (select 1 from mgmt.leave_adjustments a where a.leave_grant_id = g.id))
  ) then
    raise exception '取り込み後に取得や修正があった残数があるため、取り消せません';
  end if;
  update mgmt.leave_grants set voided_at = now(), voided_by = mgmt.current_user_id(), void_reason = btrim(p_reason)
  where import_batch_id = p_batch and voided_at is null;
  get diagnostics n = row_count;
  update mgmt.import_batches set status = 'rolled_back', rolled_back_by = mgmt.current_user_id(), rolled_back_at = now(), note = btrim(p_reason) where id = p_batch;
  return n;
end $$;

-- 期限切れの振休がある人（院長・GMのアラート用。見られる範囲だけ）
create or replace function mgmt.overdue_shift_holidays(p_as_of date default mgmt.jst_today())
returns table (user_id uuid, name text, type_code text, days numeric, oldest_expiry date)
language sql stable security definer set search_path = '' as $$
  select u.id, u.name, t.code, sum(s.remaining), min(s.expires_on)
  from mgmt.users u
  cross join mgmt.leave_types t
  cross join lateral mgmt.leave_grant_state(u.id, t.id, p_as_of) s
  where t.code in ('SHIFT','SHIFT_HOLIDAY') and u.status = 'active' and s.state = 'expired_alert' and s.remaining > 0
    and mgmt.can_view_leave_of(u.id)
  group by u.id, u.name, t.code
$$;

-- ===== RLS =====
alter table mgmt.leave_types enable row level security;
alter table mgmt.leave_policies enable row level security;
alter table mgmt.leave_grants enable row level security;
alter table mgmt.leave_usage enable row level security;
alter table mgmt.leave_adjustments enable row level security;
alter table mgmt.import_batches enable row level security;
alter table mgmt.import_rows enable row level security;

create policy leave_types_select on mgmt.leave_types for select to authenticated using (mgmt.current_user_id() is not null);
create policy leave_policies_select on mgmt.leave_policies for select to authenticated using (mgmt.current_user_id() is not null);
create policy leave_policies_insert on mgmt.leave_policies for insert to authenticated with check (mgmt.can('master.manage'));
create policy leave_grants_select on mgmt.leave_grants for select to authenticated using (mgmt.can_view_leave_of(user_id));
create policy leave_usage_select on mgmt.leave_usage for select to authenticated using (mgmt.can_view_leave_of(user_id));
create policy leave_adjustments_select on mgmt.leave_adjustments for select to authenticated using (mgmt.can_view_leave_of(user_id));
-- 付与・修正・取り込みは RPC（security invoker）からの書き込みを、権限のある人にだけ許す
create policy leave_grants_insert on mgmt.leave_grants for insert to authenticated with check (mgmt.can('leave.adjust') or mgmt.can('leave.import'));
create policy leave_grants_void on mgmt.leave_grants for update to authenticated using (mgmt.can('leave.import')) with check (mgmt.can('leave.import'));
create policy leave_adjustments_insert on mgmt.leave_adjustments for insert to authenticated with check (mgmt.can('leave.adjust'));
create policy import_batches_all on mgmt.import_batches for select to authenticated using (mgmt.can('leave.import') or mgmt.can('master.manage'));
create policy import_batches_insert on mgmt.import_batches for insert to authenticated with check (mgmt.can('leave.import') or mgmt.can('master.manage'));
create policy import_batches_update on mgmt.import_batches for update to authenticated using (mgmt.can('leave.import') or mgmt.can('master.manage')) with check (mgmt.can('leave.import') or mgmt.can('master.manage'));
create policy import_rows_select on mgmt.import_rows for select to authenticated using (mgmt.can('leave.import') or mgmt.can('master.manage'));
create policy import_rows_insert on mgmt.import_rows for insert to authenticated with check (mgmt.can('leave.import') or mgmt.can('master.manage'));
create policy import_rows_update on mgmt.import_rows for update to authenticated using (mgmt.can('leave.import') or mgmt.can('master.manage')) with check (mgmt.can('leave.import') or mgmt.can('master.manage'));

-- ===== GRANT =====
grant select on mgmt.leave_types, mgmt.leave_policies, mgmt.leave_grants, mgmt.leave_usage, mgmt.leave_adjustments, mgmt.import_batches, mgmt.import_rows to authenticated;
-- テーブルへの直接書き込みは、RPC が使う最小限だけ（leave_usage は PHASE 4 の承認RPCから）
grant insert on mgmt.leave_grants, mgmt.leave_adjustments, mgmt.import_batches, mgmt.import_rows, mgmt.leave_policies to authenticated;
grant update (voided_at, voided_by, void_reason) on mgmt.leave_grants to authenticated;
grant update (status, executed_by, executed_at, rolled_back_by, rolled_back_at, note, error_count, row_count) on mgmt.import_batches to authenticated;
grant update (result) on mgmt.import_rows to authenticated;
grant all on mgmt.leave_types, mgmt.leave_policies, mgmt.leave_grants, mgmt.leave_usage, mgmt.leave_adjustments, mgmt.import_batches, mgmt.import_rows to service_role;
revoke all on mgmt.leave_types, mgmt.leave_policies, mgmt.leave_grants, mgmt.leave_usage, mgmt.leave_adjustments, mgmt.import_batches, mgmt.import_rows from anon;

revoke execute on all functions in schema mgmt from public, anon;
grant execute on function
  mgmt.leave_balance(uuid, text, date), mgmt.five_day_status(uuid, date), mgmt.can_view_leave_of(uuid),
  mgmt.add_leave_grant(uuid, text, date, numeric, text, date, text, numeric), mgmt.adjust_leave(uuid, numeric, text),
  mgmt.import_commit(uuid), mgmt.import_rollback(uuid, text), mgmt.overdue_shift_holidays(date), mgmt.expiry_for(uuid, date),
  mgmt.leave_grant_state(uuid, uuid, date), mgmt.leave_policy_at(uuid, date)
  to authenticated;
grant execute on all functions in schema mgmt to service_role;
