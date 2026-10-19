-- 0009: シフト管理（フェーズ2）
--   - シフトの作成・確定・編集は「院長（担当院）」と本部のみ。一般スタッフは直接変更できない
--   - 書き込みはすべて RPC 経由（テーブルへの INSERT/UPDATE/DELETE 権限は誰にも与えない）
--   - 確定後の変更は理由必須、変更前後を shift_revision_logs に保存
--   - 締め済みの月のシフトは変更不可（本部による締めの再開が必要）

-- ===== 月次締め（最小構成。締め・再開の操作はフェーズ6で実装） =====
create type public.closing_status as enum ('open', 'manager_confirmed', 'closed', 'reopened');

create table public.monthly_closings (
  closing_id            uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references public.clinics (clinic_id),
  year_month            date not null check (extract(day from year_month) = 1),
  status                public.closing_status not null default 'open',
  manager_confirmed_by  uuid,
  manager_confirmed_at  timestamptz,
  closed_by             uuid,
  closed_at             timestamptz,
  reopen_count          integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint monthly_closings_unique unique (clinic_id, year_month)
);

create trigger monthly_closings_touch
  before update on public.monthly_closings
  for each row execute function app.touch_updated_at();

revoke all on public.monthly_closings from anon, authenticated;
grant select on public.monthly_closings to authenticated;
alter table public.monthly_closings enable row level security;
create policy monthly_closings_select on public.monthly_closings
  for select to authenticated using (app.can_manage_clinic(clinic_id));

-- 締め期間は暦月（末日締め）。締め日が確定したらここを差し替える
create or replace function app.is_month_closed(p_clinic_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.monthly_closings m
     where m.clinic_id = p_clinic_id
       and m.year_month = date_trunc('month', p_date)::date
       and m.status = 'closed'
  )
$$;

-- 指定日にスタッフがその院に所属（主所属または応援）しているか
create or replace function app.staff_assigned_to_clinic(p_staff_id uuid, p_clinic_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_clinic_assignments a
     where a.staff_id = p_staff_id
       and a.clinic_id = p_clinic_id
       and app.in_period(a.valid_from, a.valid_to, p_date)
  )
$$;

-- ===== 勤務パターン =====
create table public.shift_templates (
  template_id    uuid primary key default gen_random_uuid(),
  clinic_id      uuid references public.clinics (clinic_id), -- NULL は全院共通
  name           text not null check (length(btrim(name)) between 1 and 20),
  start_time     time not null,
  end_time       time not null,  -- start_time 以下なら翌日終了
  break_minutes  integer not null default 60 check (break_minutes between 0 and 600),
  color          text not null default 'sky' check (color in ('sky', 'emerald', 'amber', 'rose', 'violet', 'slate')),
  is_active      boolean not null default true,
  display_order  integer not null default 0,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint shift_templates_not_zero check (start_time <> end_time)
);
create index shift_templates_clinic_idx on public.shift_templates (clinic_id);

create trigger shift_templates_touch
  before update on public.shift_templates
  for each row execute function app.touch_updated_at();
create trigger shift_templates_forbid_delete
  before delete on public.shift_templates
  for each row execute function app.forbid_delete();

revoke all on public.shift_templates from anon, authenticated;
grant select, insert, update on public.shift_templates to authenticated;
alter table public.shift_templates enable row level security;
create policy shift_templates_select on public.shift_templates
  for select to authenticated using (clinic_id is null or app.can_manage_clinic(clinic_id));
create policy shift_templates_insert on public.shift_templates
  for insert to authenticated with check (
    case when clinic_id is null then app.is_hq() else app.can_manage_clinic(clinic_id) end
  );
create policy shift_templates_update on public.shift_templates
  for update to authenticated
  using (case when clinic_id is null then app.is_hq() else app.can_manage_clinic(clinic_id) end)
  with check (case when clinic_id is null then app.is_hq() else app.can_manage_clinic(clinic_id) end);

create trigger shift_templates_audit after insert or update on public.shift_templates
  for each row execute function app.audit_row_change('template_id');

-- ===== シフト =====
create type public.shift_type as enum (
  'work',                  -- 勤務
  'scheduled_holiday',     -- 休み（所定休日）
  'legal_holiday',         -- 法定休日（法定休日の特定ルール確定後に使用）
  'paid_leave',            -- 有給（フェーズ4で休暇承認から反映）
  'holiday_credit_leave',  -- 振休（フェーズ4）
  'other_leave'            -- その他休暇（フェーズ4）
);
create type public.shift_status as enum ('draft', 'confirmed', 'revised', 'cancelled');

create table public.shifts (
  shift_id                 uuid primary key default gen_random_uuid(),
  staff_id                 uuid not null references public.staff_profiles (staff_id),
  clinic_id                uuid not null references public.clinics (clinic_id),
  work_date                date not null,                 -- 勤務開始日（JST）
  scheduled_start          timestamptz,                   -- UTC 保存。日跨ぎは翌日の時刻になる
  scheduled_end            timestamptz,
  scheduled_break_minutes  integer not null default 0 check (scheduled_break_minutes between 0 and 600),
  shift_type               public.shift_type not null,
  status                   public.shift_status not null default 'draft',
  version                  integer not null default 1,
  template_id              uuid references public.shift_templates (template_id),
  note                     text,
  created_by               uuid,
  confirmed_by             uuid,
  confirmed_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint shifts_time_required check (
    (shift_type = 'work') = (scheduled_start is not null and scheduled_end is not null)
  ),
  constraint shifts_time_order check (
    scheduled_start is null or (scheduled_end > scheduled_start and scheduled_end - scheduled_start <= interval '24 hours')
  ),
  constraint shifts_start_on_work_date check (
    scheduled_start is null or (scheduled_start at time zone 'Asia/Tokyo')::date = work_date
  ),
  constraint shifts_break_within check (
    scheduled_start is null or scheduled_break_minutes * interval '1 minute' < scheduled_end - scheduled_start
  ),
  -- 同じスタッフの勤務時間帯の重複を、院をまたいで禁止（応援勤務の二重配置防止）
  constraint shifts_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(scheduled_start, scheduled_end) with &&
  ) where (shift_type = 'work' and status <> 'cancelled')
);
-- 休み・休暇はスタッフ1人1日1件まで
create unique index shifts_one_day_off on public.shifts (staff_id, work_date)
  where shift_type <> 'work' and status <> 'cancelled';
create index shifts_clinic_date_idx on public.shifts (clinic_id, work_date);
create index shifts_staff_date_idx on public.shifts (staff_id, work_date);

create trigger shifts_touch
  before update on public.shifts
  for each row execute function app.touch_updated_at();
create trigger shifts_forbid_delete
  before delete on public.shifts
  for each row execute function app.forbid_delete();

-- 締め済みの月は誰も変更できない（RPC を経由しない書き込みも含めて拒否）
create or replace function app.guard_shift_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_month_closed(new.clinic_id, new.work_date)
     or (tg_op = 'UPDATE' and app.is_month_closed(old.clinic_id, old.work_date)) then
    raise exception '%年%月は締め済みのため、シフトを変更できません（本部による締めの再開が必要です）',
      extract(year from new.work_date), extract(month from new.work_date)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger shifts_guard_period
  before insert or update on public.shifts
  for each row execute function app.guard_shift_period();

revoke all on public.shifts from anon, authenticated;
grant select on public.shifts to authenticated;
alter table public.shifts enable row level security;
-- 院長・本部は担当院のシフトをすべて、スタッフ本人は確定済みの自分のシフトのみ参照
create policy shifts_select on public.shifts
  for select to authenticated using (
    app.can_manage_clinic(clinic_id)
    or (staff_id = app.current_staff_id() and status in ('confirmed', 'revised'))
  );

-- ===== シフト改訂ログ（追記専用） =====
create table public.shift_revision_logs (
  id              bigint generated always as identity primary key,
  shift_id        uuid not null references public.shifts (shift_id),
  clinic_id       uuid not null references public.clinics (clinic_id),
  staff_id        uuid not null references public.staff_profiles (staff_id),
  work_date       date not null,
  action          text not null check (action in ('create', 'update', 'confirm', 'cancel')),
  version_before  integer,
  version_after   integer not null,
  before          jsonb,
  after           jsonb not null,
  reason          text,
  -- 当日以前のシフトの変更：勤怠の再計算が必要（打刻原本・承認済み実績・休暇台帳は自動では上書きしない）
  requires_recalc boolean not null default false,
  changed_by      uuid,
  changed_at      timestamptz not null default now()
);
create index shift_revision_logs_shift_idx on public.shift_revision_logs (shift_id, id);
create index shift_revision_logs_clinic_idx on public.shift_revision_logs (clinic_id, work_date);

create trigger shift_revision_logs_forbid_mutation
  before update or delete on public.shift_revision_logs
  for each row execute function app.forbid_mutation();

revoke all on public.shift_revision_logs from anon, authenticated;
grant select on public.shift_revision_logs to authenticated;
alter table public.shift_revision_logs enable row level security;
create policy shift_revision_logs_select on public.shift_revision_logs
  for select to authenticated using (app.can_manage_clinic(clinic_id));

-- ===== シフト操作 RPC =====

-- 変更内容のスナップショット（改訂ログ用）
create or replace function app.shift_snapshot(s public.shifts)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'shift_type', s.shift_type,
    'status', s.status,
    'start', to_char(s.scheduled_start at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI'),
    'end', to_char(s.scheduled_end at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI'),
    'break_minutes', s.scheduled_break_minutes,
    'template_id', s.template_id,
    'note', s.note
  )
$$;

-- 勤務日＋開始/終了時刻（JST）から UTC タイムスタンプを作る。終了が開始以下なら翌日終了
create or replace function app.shift_range(p_work_date date, p_start time, p_end time)
returns tstzrange
language sql
immutable
set search_path = ''
as $$
  select tstzrange(
    (p_work_date + p_start) at time zone 'Asia/Tokyo',
    ((p_work_date + case when p_end <= p_start then 1 else 0 end) + p_end) at time zone 'Asia/Tokyo'
  )
$$;

/*
 * シフトの一括作成・変更。1回の呼び出しは1トランザクション（1件でも失敗すれば全件取り消し）。
 * p_items: [{
 *   "shift_id": 既存シフトの変更時のみ, "expected_version": 変更時に必須（楽観ロック）,
 *   "staff_id", "clinic_id", "work_date": 新規作成時に必須（変更時は変更不可）,
 *   "shift_type": "work" | "scheduled_holiday" | ..., "start": "09:00", "end": "18:00",
 *   "break_minutes": 60, "template_id": 任意, "note": 任意
 * }]
 * 確定済み（confirmed/revised）のシフトを変更する場合は p_reason が必須。
 */
create or replace function public.save_shifts(p_items jsonb, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  existing public.shifts;
  saved public.shifts;
  v_staff uuid;
  v_clinic uuid;
  v_date date;
  v_type public.shift_type;
  v_range tstzrange;
  v_break integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  touched integer := 0;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'シフトの形式が正しくありません' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception '一度に登録できるシフトは1000件までです' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    existing := null;
    if item ? 'shift_id' and nullif(item ->> 'shift_id', '') is not null then
      select * into existing from public.shifts where shift_id = (item ->> 'shift_id')::uuid for update;
      if existing.shift_id is null then
        raise exception '対象のシフトが見つかりません' using errcode = 'P0002';
      end if;
      if existing.status = 'cancelled' then
        raise exception '取り消し済みのシフトは変更できません' using errcode = '22023';
      end if;
      if existing.version <> coalesce((item ->> 'expected_version')::integer, -1) then
        raise exception '%（%）のシフトは他の人が先に更新しました。画面を再読み込みしてください',
          existing.work_date, (select family_name || ' ' || given_name from public.staff_profiles where staff_id = existing.staff_id)
          using errcode = '40001';
      end if;
      v_staff := existing.staff_id;
      v_clinic := existing.clinic_id;
      v_date := existing.work_date;
    else
      v_staff := (item ->> 'staff_id')::uuid;
      v_clinic := (item ->> 'clinic_id')::uuid;
      v_date := (item ->> 'work_date')::date;
      if v_staff is null or v_clinic is null or v_date is null then
        raise exception 'スタッフ・院・勤務日を指定してください' using errcode = '22023';
      end if;
    end if;

    -- 権限：本部、または担当院の院長のみ（一般スタッフ・担当外の院長は拒否）
    if not app.can_manage_clinic(v_clinic) then
      raise exception '担当外の院のシフトは作成・編集できません' using errcode = '42501';
    end if;
    if not app.staff_assigned_to_clinic(v_staff, v_clinic, v_date) then
      raise exception '%：このスタッフはこの院への所属・応援登録がありません', v_date using errcode = '22023';
    end if;
    if existing.shift_id is not null and existing.status in ('confirmed', 'revised') and v_reason is null then
      raise exception '確定済みのシフトを変更するには理由を入力してください' using errcode = '22023';
    end if;

    v_type := coalesce(nullif(item ->> 'shift_type', ''), 'work')::public.shift_type;
    v_break := coalesce((item ->> 'break_minutes')::integer, 0);
    if v_type = 'work' then
      if nullif(item ->> 'start', '') is null or nullif(item ->> 'end', '') is null then
        raise exception '%：勤務の開始・終了時刻を入力してください', v_date using errcode = '22023';
      end if;
      v_range := app.shift_range(v_date, (item ->> 'start')::time, (item ->> 'end')::time);
    else
      v_range := null;
      v_break := 0;
    end if;

    begin
      if existing.shift_id is null then
        insert into public.shifts (
          staff_id, clinic_id, work_date, scheduled_start, scheduled_end, scheduled_break_minutes,
          shift_type, status, template_id, note, created_by
        ) values (
          v_staff, v_clinic, v_date, lower(v_range), upper(v_range), v_break,
          v_type, 'draft', nullif(item ->> 'template_id', '')::uuid, nullif(item ->> 'note', ''), auth.uid()
        )
        returning * into saved;

        insert into public.shift_revision_logs (
          shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after,
          reason, requires_recalc, changed_by
        ) values (
          saved.shift_id, v_clinic, v_staff, v_date, 'create', null, saved.version, null, app.shift_snapshot(saved),
          v_reason, v_date <= app.today_jst(), auth.uid()
        );
      else
        if existing.shift_type = v_type
           and existing.scheduled_start is not distinct from lower(v_range)
           and existing.scheduled_end is not distinct from upper(v_range)
           and existing.scheduled_break_minutes = v_break
           and existing.template_id is not distinct from nullif(item ->> 'template_id', '')::uuid
           and (not item ? 'note' or existing.note is not distinct from nullif(item ->> 'note', '')) then
          continue; -- 実質的な変更なし：版を上げず記録もしない
        end if;

        update public.shifts
           set scheduled_start = lower(v_range),
               scheduled_end = upper(v_range),
               scheduled_break_minutes = v_break,
               shift_type = v_type,
               template_id = nullif(item ->> 'template_id', '')::uuid,
               note = case when item ? 'note' then nullif(item ->> 'note', '') else note end,
               status = (case when existing.status = 'draft' then 'draft' else 'revised' end)::public.shift_status,
               version = existing.version + 1
         where shift_id = existing.shift_id
        returning * into saved;

        insert into public.shift_revision_logs (
          shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after,
          reason, requires_recalc, changed_by
        ) values (
          saved.shift_id, v_clinic, v_staff, v_date, 'update', existing.version, saved.version,
          app.shift_snapshot(existing), app.shift_snapshot(saved),
          v_reason, v_date <= app.today_jst(), auth.uid()
        );
      end if;
    exception
      when exclusion_violation then
        raise exception '%：同じスタッフの勤務時間が他のシフト（他院を含む）と重なっています', v_date using errcode = '23P01';
      when unique_violation then
        raise exception '%：同じ日に休み・休暇が既に登録されています', v_date using errcode = '23505';
    end;

    touched := touched + 1;
  end loop;

  return touched;
end;
$$;

-- 院・期間内の下書きシフトを一括確定
create or replace function public.confirm_shifts(p_clinic_id uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.shifts;
  confirmed public.shifts;
  n integer := 0;
begin
  if auth.uid() is null or not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院のシフトは確定できません' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception '確定する期間が正しくありません' using errcode = '22023';
  end if;

  for s in
    select * from public.shifts
     where clinic_id = p_clinic_id and work_date between p_from and p_to and status = 'draft'
     order by work_date
     for update
  loop
    update public.shifts
       set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), version = s.version + 1
     where shift_id = s.shift_id
    returning * into confirmed;

    insert into public.shift_revision_logs (
      shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after, changed_by
    ) values (
      s.shift_id, s.clinic_id, s.staff_id, s.work_date, 'confirm', s.version, confirmed.version,
      app.shift_snapshot(s), app.shift_snapshot(confirmed), auth.uid()
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- シフトの取り消し。p_items: [{"shift_id": "...", "expected_version": 3}]。確定済みは理由必須
create or replace function public.cancel_shifts(p_items jsonb, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  s public.shifts;
  cancelled public.shifts;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    select * into s from public.shifts where shift_id = (item ->> 'shift_id')::uuid for update;
    if s.shift_id is null then
      raise exception '対象のシフトが見つかりません' using errcode = 'P0002';
    end if;
    if not app.can_manage_clinic(s.clinic_id) then
      raise exception '担当外の院のシフトは取り消せません' using errcode = '42501';
    end if;
    if s.status = 'cancelled' then
      continue;
    end if;
    if s.version <> coalesce((item ->> 'expected_version')::integer, -1) then
      raise exception '%のシフトは他の人が先に更新しました。画面を再読み込みしてください', s.work_date using errcode = '40001';
    end if;
    if s.status in ('confirmed', 'revised') and v_reason is null then
      raise exception '確定済みのシフトを取り消すには理由を入力してください' using errcode = '22023';
    end if;

    update public.shifts set status = 'cancelled', version = s.version + 1
     where shift_id = s.shift_id
    returning * into cancelled;

    insert into public.shift_revision_logs (
      shift_id, clinic_id, staff_id, work_date, action, version_before, version_after, before, after,
      reason, requires_recalc, changed_by
    ) values (
      s.shift_id, s.clinic_id, s.staff_id, s.work_date, 'cancel', s.version, cancelled.version,
      app.shift_snapshot(s), app.shift_snapshot(cancelled), v_reason, s.work_date <= app.today_jst(), auth.uid()
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function app.is_month_closed(uuid, date) from public;
revoke all on function app.staff_assigned_to_clinic(uuid, uuid, date) from public;
revoke all on function app.shift_snapshot(public.shifts) from public;
revoke all on function app.shift_range(date, time, time) from public;
revoke all on function app.guard_shift_period() from public;
grant execute on function app.is_month_closed(uuid, date) to authenticated, service_role;
grant execute on function app.staff_assigned_to_clinic(uuid, uuid, date) to authenticated, service_role;
grant execute on function app.shift_snapshot(public.shifts) to authenticated, service_role;
grant execute on function app.shift_range(date, time, time) to authenticated, service_role;

revoke all on function public.save_shifts(jsonb, text) from public, anon;
revoke all on function public.confirm_shifts(uuid, date, date) from public, anon;
revoke all on function public.cancel_shifts(jsonb, text) from public, anon;
grant execute on function public.save_shifts(jsonb, text) to authenticated;
grant execute on function public.confirm_shifts(uuid, date, date) to authenticated;
grant execute on function public.cancel_shifts(jsonb, text) to authenticated;


-- ===== 画面用の参照 RPC =====

-- 期間内の各日の診療枠（シフト作成画面の休診・診療時間の表示と警告に使用。最大62日）
create or replace function public.clinic_hours_between(p_clinic_id uuid, p_from date, p_to date)
returns table (target_date date, slot_no integer, open_time time, close_time time, source text)
language sql
stable
security invoker
set search_path = ''
as $$
  select d::date, h.slot_no, h.open_time, h.close_time, h.source
    from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') as d
    cross join lateral public.clinic_hours_on(p_clinic_id, d::date) as h
$$;

-- シフトの変更履歴（変更者の表示名つき）。担当院の院長・本部のみ
create or replace function public.shift_history(p_clinic_id uuid, p_from date, p_to date)
returns table (
  id bigint, shift_id uuid, staff_id uuid, staff_name text, work_date date, action text,
  version_before integer, version_after integer, before jsonb, after jsonb, reason text,
  requires_recalc boolean, changed_by_name text, changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院の履歴は参照できません' using errcode = '42501';
  end if;
  return query
    select l.id, l.shift_id, l.staff_id, p.family_name || ' ' || p.given_name, l.work_date, l.action,
           l.version_before, l.version_after, l.before, l.after, l.reason, l.requires_recalc,
           coalesce(a.display_name, '（不明）'), l.changed_at
      from public.shift_revision_logs l
      join public.staff_profiles p on p.staff_id = l.staff_id
      left join public.app_accounts a on a.user_id = l.changed_by
     where l.clinic_id = p_clinic_id and l.work_date between p_from and p_to
     order by l.id desc
     limit 1000;
end;
$$;

revoke all on function public.clinic_hours_between(uuid, date, date) from public, anon;
revoke all on function public.shift_history(uuid, date, date) from public, anon;
grant execute on function public.clinic_hours_between(uuid, date, date) to authenticated;
grant execute on function public.shift_history(uuid, date, date) to authenticated;
