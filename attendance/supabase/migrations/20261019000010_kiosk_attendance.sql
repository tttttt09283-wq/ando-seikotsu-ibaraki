-- 0010: 共用端末打刻と勤怠実績（フェーズ3）
--
--   - 共用端末は本部が発行した登録コードで有効化し、端末シークレット（ハッシュのみ保存）で識別する
--   - 本人確認はスタッフID＋PIN（bcrypt）。5回連続失敗で15分ロック、端末単位の試行制限、全試行を記録
--   - 打刻時刻はサーバーで確定（now()）。端末時刻は参考値として保存し、正式時刻には採用しない
--   - 打刻原本（raw_punch_events）は追記専用。修正は申請・承認で「取消レコード＋新レコード」を追記する
--   - 勤怠実績（attendance_daily）は打刻原本・確定シフト・勤務条件から DB 内で計算する（画面からは書き込めない）

-- ===== 法定休日（院ごと。本部が登録。未登録の間は法定休日労働を判定しない） =====
alter table public.clinics
  add column legal_holiday_weekday smallint check (legal_holiday_weekday between 0 and 6);

-- ===== 共用端末 =====
create type public.kiosk_device_status as enum ('pending', 'active', 'disabled');

create table public.kiosk_devices (
  device_id                uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null references public.clinics (clinic_id),
  name                     text not null check (length(btrim(name)) between 1 and 40),
  status                   public.kiosk_device_status not null default 'pending',
  secret_hash              text unique,
  registration_code_hash   text,
  registration_expires_at  timestamptz,
  registered_at            timestamptz,
  last_seen_at             timestamptz,
  created_by               uuid,
  disabled_by              uuid,
  disabled_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger kiosk_devices_touch
  before update on public.kiosk_devices
  for each row execute function app.touch_updated_at();
create trigger kiosk_devices_forbid_delete
  before delete on public.kiosk_devices
  for each row execute function app.forbid_delete();

-- PIN（スタッフ本人も含め誰も直接参照できない。操作は RPC のみ）
create table public.kiosk_credentials (
  staff_id      uuid primary key references public.staff_profiles (staff_id),
  pin_hash      text not null,
  pin_set_at    timestamptz not null default now(),
  pin_set_by    uuid,
  failed_count  integer not null default 0,
  locked_until  timestamptz,
  must_change   boolean not null default true
);

-- 認証の操作ログ（追記専用）
create table public.kiosk_auth_attempts (
  id                bigint generated always as identity primary key,
  device_id         uuid references public.kiosk_devices (device_id),
  staff_code_input  text,
  staff_id          uuid references public.staff_profiles (staff_id),
  result            text not null,
  created_at        timestamptz not null default now()
);
create index kiosk_auth_attempts_device_idx on public.kiosk_auth_attempts (device_id, created_at desc);

create trigger kiosk_auth_attempts_forbid_mutation
  before update or delete on public.kiosk_auth_attempts
  for each row execute function app.forbid_mutation();

-- PIN 認証成功で発行する一回限りのセッション（打刻1回で失効）
create table public.kiosk_sessions (
  session_id   uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  device_id    uuid not null references public.kiosk_devices (device_id),
  staff_id     uuid not null references public.staff_profiles (staff_id),
  created_at   timestamptz not null default now(),
  consumed_at  timestamptz
);

-- ===== 打刻修正申請（raw_punch_events から参照するため先に作る） =====
create type public.punch_type as enum ('clock_in', 'break_start', 'break_end', 'clock_out');
create type public.adjustment_status as enum ('manager_approved', 'approved', 'rejected', 'cancelled');

create table public.attendance_adjustment_requests (
  request_id            uuid primary key default gen_random_uuid(),
  staff_id              uuid not null references public.staff_profiles (staff_id),
  work_date             date not null,
  clinic_id             uuid not null references public.clinics (clinic_id),
  change_type           text not null check (change_type in ('add', 'void', 'replace')),
  target_event_id       uuid,
  punch_type            public.punch_type,
  requested_time        timestamptz,
  before                jsonb,
  after                 jsonb,
  reason                text not null check (length(btrim(reason)) > 0),
  status                public.adjustment_status not null default 'manager_approved',
  requested_by          uuid not null,
  requested_at          timestamptz not null default now(),
  manager_approved_by   uuid,
  manager_approved_at   timestamptz,
  approved_by           uuid,
  approved_at           timestamptz,
  rejected_by           uuid,
  rejected_at           timestamptz,
  reject_reason         text,
  applied_event_ids     uuid[] not null default '{}',
  constraint adjustment_shape check (
    (change_type = 'add' and target_event_id is null and punch_type is not null and requested_time is not null)
    or (change_type = 'void' and target_event_id is not null)
    or (change_type = 'replace' and target_event_id is not null and requested_time is not null)
  )
);
create index attendance_adjustment_requests_status_idx on public.attendance_adjustment_requests (status, clinic_id);

-- ===== 打刻原本（追記専用） =====
create table public.raw_punch_events (
  event_id               uuid primary key default gen_random_uuid(),
  staff_id               uuid not null references public.staff_profiles (staff_id),
  clinic_id              uuid not null references public.clinics (clinic_id),   -- 実際に打刻（勤務）した院
  home_clinic_id         uuid references public.clinics (clinic_id),            -- 打刻時点の主所属院
  device_id              uuid references public.kiosk_devices (device_id),
  punch_type             public.punch_type not null,
  punched_at             timestamptz not null,                                  -- サーバー確定時刻（修正承認時は承認された時刻）
  client_event_id        uuid,                                                  -- 端末の再送制御用
  device_reported_at     timestamptz,                                           -- 端末時刻（参考値）
  is_delayed_submission  boolean not null default false,                       -- 通信障害などで遅れて届いた打刻
  source                 text not null check (source in ('kiosk', 'adjustment')),
  adjustment_request_id  uuid references public.attendance_adjustment_requests (request_id),
  is_void                boolean not null default false,                        -- 取消レコード
  void_of_event_id       uuid unique references public.raw_punch_events (event_id),
  created_by             uuid,
  created_at             timestamptz not null default now(),
  constraint raw_punch_void_shape check (is_void = (void_of_event_id is not null)),
  constraint raw_punch_kiosk_shape check (source <> 'kiosk' or (device_id is not null and client_event_id is not null)),
  constraint raw_punch_client_event_unique unique (device_id, client_event_id)
);
create index raw_punch_events_staff_time_idx on public.raw_punch_events (staff_id, punched_at);
create index raw_punch_events_clinic_time_idx on public.raw_punch_events (clinic_id, punched_at);

create trigger raw_punch_events_forbid_mutation
  before update or delete on public.raw_punch_events
  for each row execute function app.forbid_mutation();
create trigger raw_punch_events_forbid_truncate
  before truncate on public.raw_punch_events
  for each statement execute function app.forbid_mutation();

alter table public.attendance_adjustment_requests
  add constraint adjustment_target_fk foreign key (target_event_id) references public.raw_punch_events (event_id);

-- 有効な打刻（取消されていない、取消レコードではない）
create view app.effective_punches as
  select e.*
    from public.raw_punch_events e
   where not e.is_void
     and not exists (select 1 from public.raw_punch_events v where v.void_of_event_id = e.event_id);

-- ===== 勤怠実績 =====
create type public.attendance_status as enum ('open', 'manager_confirmed', 'closed');

create table public.attendance_daily (
  attendance_id                   uuid primary key default gen_random_uuid(),
  staff_id                        uuid not null references public.staff_profiles (staff_id),
  work_date                       date not null,
  home_clinic_id                  uuid references public.clinics (clinic_id),  -- その日の主所属院
  clinic_ids                      uuid[] not null default '{}',               -- 実際に勤務した院（応援を含む）
  first_clock_in                  timestamptz,
  last_clock_out                  timestamptz,
  break_minutes                   integer not null default 0,  -- 実休憩
  worked_minutes                  integer not null default 0,  -- 実労働
  scheduled_minutes               integer not null default 0,  -- 確定シフトの所定労働
  within_scheduled_minutes        integer not null default 0,  -- 所定内
  overtime_non_statutory_minutes  integer not null default 0,  -- 所定外・法定内
  overtime_statutory_minutes      integer not null default 0,  -- 法定時間外（1日8時間超＋週の法定時間超）
  weekly_overtime_minutes         integer not null default 0,  -- うち週の法定時間超の分
  late_night_minutes              integer not null default 0,  -- 深夜（22:00〜5:00）
  legal_holiday_minutes           integer not null default 0,  -- 法定休日労働
  scheduled_holiday_minutes       integer not null default 0,  -- 所定休日労働（シフト上の休み・会社カレンダーの休日）
  late_minutes                    integer not null default 0,
  early_leave_minutes             integer not null default 0,
  is_absent                       boolean not null default false,
  has_missing_punch               boolean not null default false,
  anomalies                       text[] not null default '{}',
  day_type                        text not null default 'workday'
                                    check (day_type in ('workday', 'legal_holiday', 'scheduled_holiday', 'company_holiday')),
  legal_holiday_configured        boolean not null default false,
  status                          public.attendance_status not null default 'open',
  needs_recalc                    boolean not null default false,
  row_version                     integer not null default 1,
  calculated_at                   timestamptz,
  confirmed_by                    uuid,
  confirmed_at                    timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint attendance_daily_unique unique (staff_id, work_date)
);
create index attendance_daily_home_clinic_idx on public.attendance_daily (home_clinic_id, work_date);
create index attendance_daily_clinic_ids_idx on public.attendance_daily using gin (clinic_ids);

create trigger attendance_daily_touch
  before update on public.attendance_daily
  for each row execute function app.touch_updated_at();
create trigger attendance_daily_forbid_delete
  before delete on public.attendance_daily
  for each row execute function app.forbid_delete();

-- 勤務区間（打刻原本から再生成される派生データ）
create table public.attendance_segments (
  segment_id     uuid primary key default gen_random_uuid(),
  attendance_id  uuid not null references public.attendance_daily (attendance_id),
  staff_id       uuid not null references public.staff_profiles (staff_id),
  work_date      date not null,
  clinic_id      uuid not null references public.clinics (clinic_id),
  clock_in       timestamptz not null,
  clock_out      timestamptz,             -- NULL は退勤なし（勤務中または打刻漏れ）
  breaks         tstzmultirange not null default '{}',
  break_minutes  integer not null default 0,
  has_delayed    boolean not null default false
);
create index attendance_segments_staff_date_idx on public.attendance_segments (staff_id, work_date);
create index attendance_segments_clinic_date_idx on public.attendance_segments (clinic_id, work_date);

-- ===== 承認ログ（一括承認でも1件ずつ記録。追記専用） =====
create table public.approval_logs (
  id           bigint generated always as identity primary key,
  target_table text not null,
  target_id    uuid not null,
  clinic_id    uuid references public.clinics (clinic_id),
  step         text not null check (step in ('manager', 'hq')),
  action       text not null check (action in ('request', 'approve', 'reject', 'cancel', 'confirm', 'reopen')),
  actor_id     uuid not null,
  batch_id     uuid,
  comment      text,
  created_at   timestamptz not null default now()
);
create index approval_logs_target_idx on public.approval_logs (target_table, target_id);

create trigger approval_logs_forbid_mutation
  before update or delete on public.approval_logs
  for each row execute function app.forbid_mutation();

-- ===== 権限（すべて参照のみ。書き込みは RPC） =====
revoke all on public.kiosk_devices, public.kiosk_credentials, public.kiosk_auth_attempts, public.kiosk_sessions,
  public.attendance_adjustment_requests, public.raw_punch_events, public.attendance_daily, public.attendance_segments,
  public.approval_logs
  from anon, authenticated;
grant select on public.kiosk_devices, public.kiosk_auth_attempts, public.attendance_adjustment_requests,
  public.raw_punch_events, public.attendance_daily, public.attendance_segments, public.approval_logs
  to authenticated;

alter table public.kiosk_devices enable row level security;
alter table public.kiosk_credentials enable row level security;
alter table public.kiosk_auth_attempts enable row level security;
alter table public.kiosk_sessions enable row level security;
alter table public.attendance_adjustment_requests enable row level security;
alter table public.raw_punch_events enable row level security;
alter table public.attendance_daily enable row level security;
alter table public.attendance_segments enable row level security;
alter table public.approval_logs enable row level security;

create policy kiosk_devices_select on public.kiosk_devices
  for select to authenticated using (app.can_manage_clinic(clinic_id));
create policy kiosk_auth_attempts_select on public.kiosk_auth_attempts
  for select to authenticated using (app.is_hq());

-- 打刻原本：本部、本人、主所属院の院長、打刻した院の院長
create policy raw_punch_events_select on public.raw_punch_events
  for select to authenticated using (
    app.is_hq()
    or staff_id = app.current_staff_id()
    or clinic_id = any (app.managed_clinic_ids())
    or home_clinic_id = any (app.managed_clinic_ids())
  );
-- 勤怠：本部、本人、その日の主所属院の院長、勤務した院（応援先）の院長
create policy attendance_daily_select on public.attendance_daily
  for select to authenticated using (
    app.is_hq()
    or staff_id = app.current_staff_id()
    or home_clinic_id = any (app.managed_clinic_ids())
    or clinic_ids && app.managed_clinic_ids()
  );
create policy attendance_segments_select on public.attendance_segments
  for select to authenticated using (
    app.is_hq()
    or staff_id = app.current_staff_id()
    or clinic_id = any (app.managed_clinic_ids())
    or exists (
      select 1 from public.attendance_daily d
       where d.attendance_id = attendance_segments.attendance_id
         and d.home_clinic_id = any (app.managed_clinic_ids())
    )
  );
create policy adjustment_requests_select on public.attendance_adjustment_requests
  for select to authenticated using (app.can_manage_clinic(clinic_id) or staff_id = app.current_staff_id());
create policy approval_logs_select on public.approval_logs
  for select to authenticated using (app.is_hq() or (clinic_id is not null and app.can_manage_clinic(clinic_id)));

-- ===== 共通ヘルパー =====
create or replace function app.sha256_hex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_value, 'sha256'), 'hex')
$$;

create or replace function app.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(32), 'hex')
$$;

create or replace function app.jst_date(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Tokyo')::date
$$;

-- 多重範囲の合計秒数
create or replace function app.mr_seconds(p_mr tstzmultirange)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(extract(epoch from upper(r) - lower(r)))::bigint, 0)
    from unnest(p_mr) as r
   where not lower_inf(r) and not upper_inf(r)
$$;

-- PIN の形式チェック：4〜8桁の数字。同じ数字の繰り返し・連番は不可
create or replace function app.assert_valid_pin(p_pin text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PINは4〜8桁の数字で設定してください' using errcode = '22023';
  end if;
  if p_pin ~ '^(\d)\1+$' or position(p_pin in '01234567890') > 0 or position(p_pin in '09876543210') > 0 then
    raise exception '同じ数字の繰り返しや連番はPINに使えません' using errcode = '22023';
  end if;
end;
$$;

-- 有効な端末をシークレットから特定する
create or replace function app.kiosk_device_by_secret(p_secret text)
returns public.kiosk_devices
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
    from public.kiosk_devices d
    join public.clinics c on c.clinic_id = d.clinic_id
   where d.secret_hash = app.sha256_hex(coalesce(p_secret, ''))
     and d.status = 'active'
     and c.status <> 'closed'
$$;

-- スタッフの現在の打刻状態：off（勤務外）/ working（勤務中）/ on_break（休憩中）
-- 16時間以内に始まった、退勤のない勤務区間を「勤務中」とみなす
create or replace function app.kiosk_staff_state(p_staff_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  last_in timestamptz;
  last_break timestamptz;
begin
  select max(punched_at) into last_in
    from app.effective_punches
   where staff_id = p_staff_id and punch_type = 'clock_in' and punched_at > now() - interval '16 hours';
  if last_in is null
     or exists (select 1 from app.effective_punches where staff_id = p_staff_id and punch_type = 'clock_out' and punched_at >= last_in) then
    return 'off';
  end if;
  select max(punched_at) into last_break
    from app.effective_punches
   where staff_id = p_staff_id and punch_type = 'break_start' and punched_at >= last_in;
  if last_break is not null
     and not exists (select 1 from app.effective_punches where staff_id = p_staff_id and punch_type = 'break_end' and punched_at >= last_break) then
    return 'on_break';
  end if;
  return 'working';
end;
$$;

-- ===== 勤怠計算 =====
create type app.punch_segment as (
  work_date  date,
  clinic_id  uuid,
  clock_in   timestamptz,
  clock_out  timestamptz,
  breaks     tstzmultirange,
  delayed    boolean
);

/*
 * スタッフの勤怠を週単位（日曜〜土曜）で再計算する。
 *   - 勤務日は出勤打刻の日（JST）。日跨ぎの退勤は出勤日に含める
 *   - 実労働 = 出勤〜退勤 − 休憩
 *   - 法定時間外 = 1日8時間超 ＋ 週の法定時間（契約。既定40時間）超。法定休日の労働は時間外に含めない
 *   - 深夜 = 22:00〜翌5:00 の実労働（休憩を除く）
 *   - 法定休日 = 勤務条件の曜日、なければ主所属院の曜日（未登録なら判定しない）
 *   - 遅刻・早退・欠勤は確定シフト（confirmed / revised）と比較
 *   - 締め済みの月の日は変更しない
 */
create or replace function app.recalc_attendance(p_staff_id uuid, p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_start date := p_from - extract(dow from p_from)::integer;
  week_end   date := p_to + (6 - extract(dow from p_to)::integer);
  today      date := app.today_jst();
  ev         record;
  segs       app.punch_segment[] := '{}';
  flags      text[] := '{}';              -- 'YYYY-MM-DD|code'
  cur_start  timestamptz;
  cur_clinic uuid;
  cur_breaks tstzmultirange;
  cur_delayed boolean;
  brk_start  timestamptz;
  d          date;
  cum_legal  integer;
  cur_week   date;
  -- 1日分
  home_clinic uuid;
  contract   public.employment_contracts;
  legal_wd   smallint;
  day_segs   app.punch_segment[];
  closed_segs_sec bigint;
  worked     integer;
  brk        integer;
  night      integer;
  sched      integer;
  shift_first timestamptz;
  shift_last  timestamptz;
  has_work_shift boolean;
  has_leave  boolean;
  is_holiday boolean;
  is_legal   boolean;
  v_day_type text;
  first_in   timestamptz;
  last_out   timestamptz;
  has_open   boolean;
  open_stale boolean;
  daily_ot   integer;
  base_legal integer;
  within     integer;
  non_stat   integer;
  weekly_ot  integer;
  weekly_limit integer;
  day_flags  text[];
  existing   public.attendance_daily;
  new_vals   jsonb;
  old_vals   jsonb;
  v_attendance_id uuid;
  night_mr   tstzmultirange;
  seg        app.punch_segment;
  worked_mr  tstzmultirange;
begin
  if p_to < p_from or p_to - p_from > 62 then
    raise exception '再計算の期間が正しくありません' using errcode = '22023';
  end if;

  -- 1. 打刻原本から勤務区間を組み立てる（前後の日跨ぎを拾うため1日広く読む）
  for ev in
    select * from app.effective_punches
     where staff_id = p_staff_id
       and punched_at >= ((week_start - 1) + time '00:00') at time zone 'Asia/Tokyo'
       and punched_at < ((week_end + 2) + time '00:00') at time zone 'Asia/Tokyo'
     order by punched_at, created_at
  loop
    if ev.punch_type = 'clock_in' then
      if cur_start is not null then
        segs := segs || row(app.jst_date(cur_start), cur_clinic, cur_start, null, cur_breaks, cur_delayed)::app.punch_segment;
        flags := flags || (app.jst_date(cur_start)::text || '|missing_clock_out');
      end if;
      cur_start := ev.punched_at;
      cur_clinic := ev.clinic_id;
      cur_breaks := '{}';
      cur_delayed := ev.is_delayed_submission;
      brk_start := null;
    elsif ev.punch_type = 'break_start' then
      if cur_start is null then
        flags := flags || (app.jst_date(ev.punched_at)::text || '|orphan_break');
      elsif brk_start is null then
        brk_start := ev.punched_at;
      end if;
    elsif ev.punch_type = 'break_end' then
      if cur_start is null or brk_start is null then
        flags := flags || (app.jst_date(ev.punched_at)::text || '|orphan_break');
      else
        cur_breaks := cur_breaks + tstzmultirange(tstzrange(brk_start, ev.punched_at));
        brk_start := null;
      end if;
    elsif ev.punch_type = 'clock_out' then
      if cur_start is null then
        flags := flags || (app.jst_date(ev.punched_at)::text || '|clock_out_without_in');
      else
        if brk_start is not null then
          cur_breaks := cur_breaks + tstzmultirange(tstzrange(brk_start, ev.punched_at));
          flags := flags || (app.jst_date(cur_start)::text || '|missing_break_end');
          brk_start := null;
        end if;
        segs := segs || row(app.jst_date(cur_start), cur_clinic, cur_start, ev.punched_at, cur_breaks,
                            cur_delayed or ev.is_delayed_submission)::app.punch_segment;
        cur_start := null;
      end if;
    end if;
    if cur_start is not null and ev.is_delayed_submission then
      cur_delayed := true;
    end if;
  end loop;
  if cur_start is not null then
    if brk_start is not null then
      cur_breaks := cur_breaks + tstzmultirange(tstzrange(brk_start, null));
    end if;
    segs := segs || row(app.jst_date(cur_start), cur_clinic, cur_start, null, cur_breaks, cur_delayed)::app.punch_segment;
  end if;

  -- 2. 日ごとに集計（週ごとに法定時間の累計を持つ）
  cur_week := null;
  for d in select generate_series(week_start, week_end, interval '1 day')::date loop
    if cur_week is distinct from d - extract(dow from d)::integer then
      cur_week := d - extract(dow from d)::integer;
      cum_legal := 0;
    end if;

    home_clinic := app.staff_primary_clinic_id(p_staff_id, d);
    select * into contract
      from public.employment_contracts c
     where c.staff_id = p_staff_id and app.in_period(c.valid_from, c.valid_to, d);
    weekly_limit := coalesce(contract.legal_weekly_limit_minutes, 2400);
    legal_wd := coalesce(contract.legal_holiday_weekday, (select c.legal_holiday_weekday from public.clinics c where c.clinic_id = home_clinic));

    select coalesce(array_agg(s order by s.clock_in), '{}') into day_segs from unnest(segs) s where s.work_date = d;

    -- 確定シフト
    select coalesce(sum(extract(epoch from (s.scheduled_end - s.scheduled_start)) / 60 - s.scheduled_break_minutes), 0)::integer,
           min(s.scheduled_start), max(s.scheduled_end), count(*) > 0
      into sched, shift_first, shift_last, has_work_shift
      from public.shifts s
     where s.staff_id = p_staff_id and s.work_date = d and s.shift_type = 'work' and s.status in ('confirmed', 'revised');
    select exists (
      select 1 from public.shifts s
       where s.staff_id = p_staff_id and s.work_date = d and s.shift_type <> 'work' and s.status in ('confirmed', 'revised')
    ) into has_leave;
    is_holiday := exists (select 1 from public.company_holidays h where h.holiday_date = d);
    is_legal := legal_wd is not null and extract(dow from d)::integer = legal_wd;

    -- 実績
    worked := 0; brk := 0; night := 0; has_open := false; open_stale := false;
    first_in := null; last_out := null;
    night_mr := tstzmultirange(
      tstzrange(((d - 1) + time '22:00') at time zone 'Asia/Tokyo', (d + time '05:00') at time zone 'Asia/Tokyo'),
      tstzrange((d + time '22:00') at time zone 'Asia/Tokyo', ((d + 1) + time '05:00') at time zone 'Asia/Tokyo'),
      tstzrange(((d + 1) + time '22:00') at time zone 'Asia/Tokyo', ((d + 2) + time '05:00') at time zone 'Asia/Tokyo')
    );
    closed_segs_sec := 0;
    foreach seg in array day_segs loop
      first_in := least(first_in, seg.clock_in);
      if seg.clock_out is null then
        has_open := true;
        if seg.clock_in < now() - interval '16 hours' then
          open_stale := true;
        end if;
        continue;
      end if;
      last_out := greatest(last_out, seg.clock_out);
      worked_mr := tstzmultirange(tstzrange(seg.clock_in, seg.clock_out)) - seg.breaks;
      closed_segs_sec := closed_segs_sec + app.mr_seconds(worked_mr);
      brk := brk + (app.mr_seconds(seg.breaks * tstzmultirange(tstzrange(seg.clock_in, seg.clock_out))) / 60)::integer;
      night := night + (app.mr_seconds(worked_mr * night_mr) / 60)::integer;
    end loop;
    worked := (closed_segs_sec / 60)::integer;

    day_flags := array(select split_part(f, '|', 2) from unnest(flags) f where split_part(f, '|', 1) = d::text);
    if open_stale then
      day_flags := day_flags || 'missing_clock_out'::text;
    end if;
    if exists (select 1 from unnest(day_segs) s where s.delayed) then
      day_flags := day_flags || 'delayed_submission'::text;
    end if;
    if exists (select 1 from unnest(day_segs) s where not app.staff_assigned_to_clinic(p_staff_id, s.clinic_id, d)) then
      day_flags := day_flags || 'unassigned_clinic'::text;
    end if;
    if worked > 0 and not has_work_shift then
      day_flags := day_flags || 'unscheduled_work'::text;
    end if;
    if (worked > 480 and brk < 60) or (worked > 360 and brk < 45) then
      day_flags := day_flags || 'break_shortage'::text;
    end if;
    day_flags := array(select distinct x from unnest(day_flags) x order by 1);

    v_day_type := case
      when is_legal then 'legal_holiday'
      when not has_work_shift and is_holiday then 'company_holiday'
      when not has_work_shift and (has_leave or worked > 0) then 'scheduled_holiday'
      else 'workday'
    end;

    daily_ot := case when is_legal then 0 else greatest(0, worked - 480) end;
    base_legal := case when is_legal then 0 else least(worked, 480) end;
    within := case when is_legal then 0 else least(worked, sched, 480) end;
    non_stat := base_legal - within;
    weekly_ot := greatest(0, cum_legal + base_legal - weekly_limit) - greatest(0, cum_legal - weekly_limit);
    cum_legal := cum_legal + base_legal;
    -- 週の法定時間超の分は、所定外（法定内）→ 所定内の順に法定時間外へ振り替える
    within := within - (weekly_ot - least(non_stat, weekly_ot));
    non_stat := non_stat - least(non_stat, weekly_ot);

    -- 締め済みの月は変更しない（週の累計計算には含める）
    continue when home_clinic is not null and app.is_month_closed(home_clinic, d);

    select * into existing from public.attendance_daily a where a.staff_id = p_staff_id and a.work_date = d for update;
    if existing.attendance_id is null and cardinality(day_segs) = 0 and not has_work_shift and cardinality(day_flags) = 0 then
      continue; -- 打刻もシフトもない日は行を作らない
    end if;

    new_vals := jsonb_build_object(
      'home_clinic_id', home_clinic,
      'clinic_ids', (select coalesce(jsonb_agg(distinct s.clinic_id order by s.clinic_id), '[]'::jsonb) from unnest(day_segs) s),
      'first_clock_in', first_in,
      'last_clock_out', case when has_open then null else last_out end,
      'break_minutes', brk,
      'worked_minutes', worked,
      'scheduled_minutes', sched,
      'within_scheduled_minutes', within,
      'overtime_non_statutory_minutes', non_stat,
      'overtime_statutory_minutes', daily_ot + weekly_ot,
      'weekly_overtime_minutes', weekly_ot,
      'late_night_minutes', night,
      'legal_holiday_minutes', case when is_legal then worked else 0 end,
      'scheduled_holiday_minutes', case when v_day_type in ('scheduled_holiday', 'company_holiday') then worked else 0 end,
      'late_minutes', case when has_work_shift and first_in > shift_first
                           then floor(extract(epoch from first_in - shift_first) / 60)::integer else 0 end,
      'early_leave_minutes', case when has_work_shift and not has_open and last_out is not null and last_out < shift_last
                                  then floor(extract(epoch from shift_last - last_out) / 60)::integer else 0 end,
      'is_absent', has_work_shift and d < today and cardinality(day_segs) = 0 and not has_leave,
      'has_missing_punch', open_stale or day_flags && array['missing_clock_out', 'missing_break_end', 'clock_out_without_in', 'orphan_break'],
      'anomalies', to_jsonb(day_flags),
      'day_type', v_day_type,
      'legal_holiday_configured', legal_wd is not null
    );

    if existing.attendance_id is null then
      insert into public.attendance_daily (staff_id, work_date, calculated_at)
      values (p_staff_id, d, now())
      returning * into existing;
      old_vals := null;
    else
      old_vals := jsonb_build_object(
        'home_clinic_id', existing.home_clinic_id,
        'clinic_ids', to_jsonb(existing.clinic_ids),
        'first_clock_in', existing.first_clock_in,
        'last_clock_out', existing.last_clock_out,
        'break_minutes', existing.break_minutes,
        'worked_minutes', existing.worked_minutes,
        'scheduled_minutes', existing.scheduled_minutes,
        'within_scheduled_minutes', existing.within_scheduled_minutes,
        'overtime_non_statutory_minutes', existing.overtime_non_statutory_minutes,
        'overtime_statutory_minutes', existing.overtime_statutory_minutes,
        'weekly_overtime_minutes', existing.weekly_overtime_minutes,
        'late_night_minutes', existing.late_night_minutes,
        'legal_holiday_minutes', existing.legal_holiday_minutes,
        'scheduled_holiday_minutes', existing.scheduled_holiday_minutes,
        'late_minutes', existing.late_minutes,
        'early_leave_minutes', existing.early_leave_minutes,
        'is_absent', existing.is_absent,
        'has_missing_punch', existing.has_missing_punch,
        'anomalies', to_jsonb(array(select x from unnest(existing.anomalies) x where x <> 'changed_after_confirm' order by 1)),
        'day_type', existing.day_type,
        'legal_holiday_configured', existing.legal_holiday_configured
      );
    end if;
    v_attendance_id := existing.attendance_id;

    if old_vals is distinct from new_vals then
      update public.attendance_daily a
         set home_clinic_id = home_clinic,
             clinic_ids = array(select distinct s.clinic_id from unnest(day_segs) s order by 1),
             first_clock_in = first_in,
             last_clock_out = (new_vals ->> 'last_clock_out')::timestamptz,
             break_minutes = brk,
             worked_minutes = worked,
             scheduled_minutes = sched,
             within_scheduled_minutes = within,
             overtime_non_statutory_minutes = non_stat,
             overtime_statutory_minutes = daily_ot + weekly_ot,
             weekly_overtime_minutes = weekly_ot,
             late_night_minutes = night,
             legal_holiday_minutes = (new_vals ->> 'legal_holiday_minutes')::integer,
             scheduled_holiday_minutes = (new_vals ->> 'scheduled_holiday_minutes')::integer,
             late_minutes = (new_vals ->> 'late_minutes')::integer,
             early_leave_minutes = (new_vals ->> 'early_leave_minutes')::integer,
             is_absent = (new_vals ->> 'is_absent')::boolean,
             has_missing_punch = (new_vals ->> 'has_missing_punch')::boolean,
             -- 院長確認後に値が変わった場合は確認を取り消し、印を付ける
             anomalies = day_flags || case when existing.status = 'manager_confirmed' and old_vals is not null
                                           then array['changed_after_confirm'] else '{}'::text[] end,
             day_type = v_day_type,
             legal_holiday_configured = legal_wd is not null,
             status = case when existing.status = 'manager_confirmed' and old_vals is not null then 'open' else existing.status end,
             confirmed_by = case when existing.status = 'manager_confirmed' and old_vals is not null then null else existing.confirmed_by end,
             confirmed_at = case when existing.status = 'manager_confirmed' and old_vals is not null then null else existing.confirmed_at end,
             row_version = existing.row_version + case when old_vals is null then 0 else 1 end,
             needs_recalc = false,
             calculated_at = now()
       where a.attendance_id = v_attendance_id;
    else
      update public.attendance_daily a set needs_recalc = false, calculated_at = now() where a.attendance_id = v_attendance_id;
    end if;

    delete from public.attendance_segments s where s.staff_id = p_staff_id and s.work_date = d;
    insert into public.attendance_segments (attendance_id, staff_id, work_date, clinic_id, clock_in, clock_out, breaks, break_minutes, has_delayed)
    select v_attendance_id, p_staff_id, d, s.clinic_id, s.clock_in, s.clock_out, s.breaks,
           (app.mr_seconds(s.breaks * tstzmultirange(tstzrange(s.clock_in, coalesce(s.clock_out, now())))) / 60)::integer,
           s.delayed
      from unnest(day_segs) s;
  end loop;
end;
$$;

-- 過去・当日のシフトが変わったら、勤怠に「再計算が必要」の印を付ける（自動では上書きしない）
create or replace function app.mark_attendance_needs_recalc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendance_daily
     set needs_recalc = true
   where staff_id = new.staff_id
     and work_date in (new.work_date, coalesce(old.work_date, new.work_date))
     and not needs_recalc;
  return new;
end;
$$;

create trigger shifts_mark_attendance
  after insert or update on public.shifts
  for each row execute function app.mark_attendance_needs_recalc();

-- ===== 共用端末 RPC（端末から呼ぶもの：未ログイン＝anon で実行可。端末シークレットで認証） =====

-- 登録コードで端末を有効化。シークレットはこの戻り値でのみ返す（DB にはハッシュのみ）
create or replace function public.kiosk_register_device(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices;
  secret text := app.random_token();
  clinic_name text;
begin
  select * into device
    from public.kiosk_devices
   where status = 'pending'
     and registration_code_hash = app.sha256_hex(upper(btrim(coalesce(p_code, ''))))
     and registration_expires_at > now()
   for update;
  if device.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.kiosk_devices
     set status = 'active', secret_hash = app.sha256_hex(secret), registration_code_hash = null,
         registration_expires_at = null, registered_at = now(), last_seen_at = now()
   where device_id = device.device_id;
  select name into clinic_name from public.clinics where clinic_id = device.clinic_id;

  return jsonb_build_object('ok', true, 'device_id', device.device_id, 'secret', secret,
                            'clinic_name', clinic_name, 'device_name', device.name);
end;
$$;

-- 端末の状態（待受画面の表示・時刻合わせ用）
create or replace function public.kiosk_device_info(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices := app.kiosk_device_by_secret(p_secret);
begin
  if device.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'device_invalid', 'server_time', now());
  end if;
  update public.kiosk_devices set last_seen_at = now() where device_id = device.device_id;
  return jsonb_build_object(
    'ok', true, 'server_time', now(), 'device_name', device.name,
    'clinic_name', (select name from public.clinics where clinic_id = device.clinic_id)
  );
end;
$$;

-- スタッフID＋PIN で本人確認し、一回限りのセッションを発行する
create or replace function public.kiosk_authenticate(p_secret text, p_staff_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices := app.kiosk_device_by_secret(p_secret);
  staff public.staff_profiles;
  cred public.kiosk_credentials;
  token text;
  failures integer;
begin
  if device.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'device_invalid');
  end if;
  update public.kiosk_devices set last_seen_at = now() where device_id = device.device_id;

  -- 端末単位の試行制限（10分間に30回失敗で一時停止）
  select count(*) into failures
    from public.kiosk_auth_attempts
   where device_id = device.device_id and result <> 'success' and created_at > now() - interval '10 minutes';
  if failures >= 30 then
    insert into public.kiosk_auth_attempts (device_id, staff_code_input, result) values (device.device_id, left(p_staff_code, 20), 'device_throttled');
    return jsonb_build_object('ok', false, 'error', 'throttled');
  end if;

  select * into staff from public.staff_profiles where staff_code = btrim(coalesce(p_staff_code, '')) and status <> 'retired';
  if staff.staff_id is null then
    insert into public.kiosk_auth_attempts (device_id, staff_code_input, result) values (device.device_id, left(p_staff_code, 20), 'unknown_id');
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into cred from public.kiosk_credentials where staff_id = staff.staff_id for update;
  if cred.staff_id is null then
    insert into public.kiosk_auth_attempts (device_id, staff_code_input, staff_id, result) values (device.device_id, staff.staff_code, staff.staff_id, 'no_pin');
    return jsonb_build_object('ok', false, 'error', 'no_pin');
  end if;
  if cred.locked_until is not null and cred.locked_until > now() then
    insert into public.kiosk_auth_attempts (device_id, staff_code_input, staff_id, result) values (device.device_id, staff.staff_code, staff.staff_id, 'locked');
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', cred.locked_until);
  end if;

  if extensions.crypt(coalesce(p_pin, ''), cred.pin_hash) <> cred.pin_hash then
    update public.kiosk_credentials
       set failed_count = cred.failed_count + 1,
           locked_until = case when cred.failed_count + 1 >= 5 then now() + interval '15 minutes' else null end
     where staff_id = staff.staff_id;
    insert into public.kiosk_auth_attempts (device_id, staff_code_input, staff_id, result) values (device.device_id, staff.staff_code, staff.staff_id, 'bad_pin');
    if cred.failed_count + 1 >= 5 then
      return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid', 'remaining', 5 - (cred.failed_count + 1));
  end if;

  update public.kiosk_credentials set failed_count = 0, locked_until = null where staff_id = staff.staff_id;
  token := app.random_token();
  insert into public.kiosk_sessions (token_hash, device_id, staff_id) values (app.sha256_hex(token), device.device_id, staff.staff_id);
  insert into public.kiosk_auth_attempts (device_id, staff_code_input, staff_id, result) values (device.device_id, staff.staff_code, staff.staff_id, 'success');

  return jsonb_build_object(
    'ok', true,
    'session_token', token,
    'staff_name', staff.family_name || ' ' || staff.given_name,
    'state', app.kiosk_staff_state(staff.staff_id),
    'must_change_pin', cred.must_change
  );
end;
$$;

-- 打刻。時刻はサーバーの now() で確定する。同じ client_event_id の再送は同じ結果を返す（二重登録しない）
create or replace function public.kiosk_punch(
  p_secret text,
  p_session_token text,
  p_punch_type text,
  p_client_event_id uuid,
  p_device_reported_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices := app.kiosk_device_by_secret(p_secret);
  sess public.kiosk_sessions;
  existing public.raw_punch_events;
  last_event record;
  state text;
  v_type public.punch_type;
  delayed boolean;
  inserted public.raw_punch_events;
  staff_name text;
begin
  if device.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'device_invalid');
  end if;
  if p_client_event_id is null or p_punch_type not in ('clock_in', 'break_start', 'break_end', 'clock_out') then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  v_type := p_punch_type::public.punch_type;

  -- 再送（同じ端末・同じ client_event_id）は記録済みの内容を返す
  select * into existing from public.raw_punch_events where device_id = device.device_id and client_event_id = p_client_event_id;
  if existing.event_id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'punch_type', existing.punch_type, 'punched_at', existing.punched_at,
      'staff_name', (select family_name || ' ' || given_name from public.staff_profiles where staff_id = existing.staff_id));
  end if;

  select * into sess from public.kiosk_sessions
   where token_hash = app.sha256_hex(coalesce(p_session_token, '')) and device_id = device.device_id
   for update;
  if sess.session_id is null or sess.consumed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'session_invalid');
  end if;
  if sess.created_at < now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'session_expired');
  end if;
  -- 認証から2分を超えて届いた打刻は「遅延送信」として記録し、勤怠の異常として院長が確認する
  delayed := sess.created_at < now() - interval '2 minutes';
  select family_name || ' ' || given_name into staff_name from public.staff_profiles where staff_id = sess.staff_id;

  -- ボタンの連打・二度押し：直前（2分以内）と同じ打刻は記録済みとして扱う
  select punch_type, punched_at into last_event
    from app.effective_punches where staff_id = sess.staff_id order by punched_at desc limit 1;
  if last_event.punch_type = v_type and last_event.punched_at > now() - interval '2 minutes' then
    update public.kiosk_sessions set consumed_at = now() where session_id = sess.session_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'punch_type', v_type, 'punched_at', last_event.punched_at, 'staff_name', staff_name);
  end if;

  state := app.kiosk_staff_state(sess.staff_id);
  if (v_type = 'clock_in' and state <> 'off')
     or (v_type = 'break_start' and state <> 'working')
     or (v_type = 'break_end' and state <> 'on_break')
     or (v_type = 'clock_out' and state <> 'working') then
    return jsonb_build_object('ok', false, 'error', 'invalid_transition', 'state', state);
  end if;

  insert into public.raw_punch_events (
    staff_id, clinic_id, home_clinic_id, device_id, punch_type, punched_at,
    client_event_id, device_reported_at, is_delayed_submission, source
  ) values (
    sess.staff_id, device.clinic_id, app.staff_primary_clinic_id(sess.staff_id, app.today_jst()), device.device_id, v_type, now(),
    p_client_event_id, p_device_reported_at, delayed, 'kiosk'
  )
  returning * into inserted;
  update public.kiosk_sessions set consumed_at = now() where session_id = sess.session_id;
  update public.kiosk_devices set last_seen_at = now() where device_id = device.device_id;

  perform app.recalc_attendance(sess.staff_id, app.today_jst() - 1, app.today_jst());

  return jsonb_build_object('ok', true, 'duplicate', false, 'punch_type', inserted.punch_type,
                            'punched_at', inserted.punched_at, 'staff_name', staff_name, 'delayed', delayed);
end;
$$;

-- 端末での PIN 変更（初回 PIN は本部発行のため、最初の利用時に本人が変更する）
create or replace function public.kiosk_change_pin(p_secret text, p_session_token text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices := app.kiosk_device_by_secret(p_secret);
  sess public.kiosk_sessions;
  token text;
begin
  if device.device_id is null then
    return jsonb_build_object('ok', false, 'error', 'device_invalid');
  end if;
  select * into sess from public.kiosk_sessions
   where token_hash = app.sha256_hex(coalesce(p_session_token, '')) and device_id = device.device_id
   for update;
  if sess.session_id is null or sess.consumed_at is not null or sess.created_at < now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'session_invalid');
  end if;
  begin
    perform app.assert_valid_pin(p_new_pin);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'weak_pin', 'message', sqlerrm);
  end;

  update public.kiosk_credentials
     set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)), pin_set_at = now(), pin_set_by = null,
         must_change = false, failed_count = 0, locked_until = null
   where staff_id = sess.staff_id;
  update public.kiosk_sessions set consumed_at = now() where session_id = sess.session_id;
  token := app.random_token();
  insert into public.kiosk_sessions (token_hash, device_id, staff_id) values (app.sha256_hex(token), device.device_id, sess.staff_id);
  return jsonb_build_object('ok', true, 'session_token', token);
end;
$$;

-- ===== 管理用 RPC（ログイン必須） =====

-- 端末の登録コードを発行（本部のみ）。p_device_id を指定すると既存端末を再登録（旧端末は使えなくなる）
create or replace function public.issue_kiosk_registration(p_clinic_id uuid, p_name text, p_device_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  bytes bytea := extensions.gen_random_bytes(8);
  v_device_id uuid;
  i integer;
begin
  if not app.is_hq() then
    raise exception '端末の登録は本部のみ可能です' using errcode = '42501';
  end if;
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;

  if p_device_id is null then
    insert into public.kiosk_devices (clinic_id, name, status, registration_code_hash, registration_expires_at, created_by)
    values (p_clinic_id, p_name, 'pending', app.sha256_hex(code), now() + interval '24 hours', auth.uid())
    returning device_id into v_device_id;
  else
    update public.kiosk_devices
       set status = 'pending', secret_hash = null, registration_code_hash = app.sha256_hex(code),
           registration_expires_at = now() + interval '24 hours', name = coalesce(nullif(btrim(p_name), ''), name)
     where device_id = p_device_id
    returning device_id into v_device_id;
    if v_device_id is null then
      raise exception '端末が見つかりません' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id, after)
  values (auth.uid(), 'user', 'issue_registration', 'kiosk_devices', v_device_id::text, jsonb_build_object('clinic_id', p_clinic_id, 'name', p_name));
  return jsonb_build_object('device_id', v_device_id, 'code', code, 'expires_at', now() + interval '24 hours');
end;
$$;

create or replace function public.disable_kiosk_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception '端末の停止は本部のみ可能です' using errcode = '42501';
  end if;
  update public.kiosk_devices
     set status = 'disabled', secret_hash = null, registration_code_hash = null, disabled_at = now(), disabled_by = auth.uid()
   where device_id = p_device_id;
  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id)
  values (auth.uid(), 'user', 'disable', 'kiosk_devices', p_device_id::text);
end;
$$;

-- PIN の発行・再発行（本部のみ）。初回利用時に本人が変更する
create or replace function public.set_kiosk_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception 'PINの発行は本部のみ可能です' using errcode = '42501';
  end if;
  perform app.assert_valid_pin(p_pin);
  insert into public.kiosk_credentials (staff_id, pin_hash, pin_set_at, pin_set_by, failed_count, locked_until, must_change)
  values (p_staff_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now(), auth.uid(), 0, null, true)
  on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash, pin_set_at = now(), pin_set_by = auth.uid(),
        failed_count = 0, locked_until = null, must_change = true;
  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id)
  values (auth.uid(), 'user', 'set_pin', 'kiosk_credentials', p_staff_id::text);
end;
$$;

-- ロック解除（本部、または主所属院の院長）
create or replace function public.unlock_kiosk_pin(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (app.is_hq() or app.staff_primary_clinic_id(p_staff_id) = any (app.managed_clinic_ids())) then
    raise exception 'このスタッフのロックを解除する権限がありません' using errcode = '42501';
  end if;
  update public.kiosk_credentials set failed_count = 0, locked_until = null where staff_id = p_staff_id;
  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id)
  values (auth.uid(), 'user', 'unlock_pin', 'kiosk_credentials', p_staff_id::text);
end;
$$;

create or replace function public.kiosk_pin_status(p_staff_id uuid)
returns table (has_pin boolean, must_change boolean, locked_until timestamptz, failed_count integer, pin_set_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_view_staff_private(p_staff_id) then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  return query
    select c.staff_id is not null, coalesce(c.must_change, false),
           case when c.locked_until > now() then c.locked_until end, coalesce(c.failed_count, 0), c.pin_set_at
      from (select p_staff_id as staff_id) s
      left join public.kiosk_credentials c on c.staff_id = s.staff_id;
end;
$$;

-- 勤怠の再計算（院長・本部）。担当院に所属・応援登録のあるスタッフが対象
create or replace function public.recalc_attendance(p_clinic_id uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
  n integer := 0;
begin
  if not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院の勤怠は再計算できません' using errcode = '42501';
  end if;
  for s in
    select distinct a.staff_id from public.staff_clinic_assignments a
     where a.clinic_id = p_clinic_id and a.valid_from <= p_to and (a.valid_to is null or a.valid_to >= p_from)
  loop
    perform app.recalc_attendance(s, p_from, p_to);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 院長確認（日単位）。打刻漏れ・再計算待ちの日は確認できない
create or replace function public.confirm_attendance(p_clinic_id uuid, p_from date, p_to date, p_staff_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.attendance_daily;
  confirmed integer := 0;
  skipped integer := 0;
  batch uuid := gen_random_uuid();
begin
  if not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院の勤怠は確認できません' using errcode = '42501';
  end if;
  for r in
    select * from public.attendance_daily a
     where a.home_clinic_id = p_clinic_id and a.work_date between p_from and p_to and a.status = 'open'
       and a.work_date < app.today_jst()
       and (p_staff_ids is null or a.staff_id = any (p_staff_ids))
     for update
  loop
    if r.has_missing_punch or r.needs_recalc or app.is_month_closed(p_clinic_id, r.work_date) then
      skipped := skipped + 1;
      continue;
    end if;
    update public.attendance_daily
       set status = 'manager_confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
           anomalies = array_remove(anomalies, 'changed_after_confirm')
     where attendance_id = r.attendance_id;
    insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, batch_id)
    values ('attendance_daily', r.attendance_id, p_clinic_id, 'manager', 'confirm', auth.uid(), batch);
    confirmed := confirmed + 1;
  end loop;
  return jsonb_build_object('confirmed', confirmed, 'skipped', skipped);
end;
$$;

-- 打刻修正の申請（院長・本部）。申請者が院長のため一次承認済みとして登録し、本部が最終承認する
create or replace function public.request_attendance_adjustment(
  p_staff_id uuid,
  p_work_date date,
  p_clinic_id uuid,
  p_change_type text,
  p_target_event_id uuid,
  p_punch_type text,
  p_requested_time timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.raw_punch_events;
  v_id uuid;
  home uuid := app.staff_primary_clinic_id(p_staff_id, p_work_date);
begin
  if auth.uid() is null or not app.can_manage_clinic(p_clinic_id) then
    raise exception '担当外の院の打刻は修正申請できません' using errcode = '42501';
  end if;
  if not (app.staff_assigned_to_clinic(p_staff_id, p_clinic_id, p_work_date) or home = p_clinic_id) then
    raise exception 'このスタッフはこの院への所属・応援登録がありません' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '修正理由を入力してください' using errcode = '22023';
  end if;
  if app.is_month_closed(coalesce(home, p_clinic_id), p_work_date) then
    raise exception '締め済みの月の打刻は修正できません（本部による締めの再開が必要です）' using errcode = 'P0001';
  end if;
  if p_requested_time is not null and p_requested_time > now() then
    raise exception '未来の時刻には修正できません' using errcode = '22023';
  end if;

  if p_change_type in ('void', 'replace') then
    select * into target from app.effective_punches e where e.event_id = p_target_event_id and e.staff_id = p_staff_id;
    if target.event_id is null then
      raise exception '修正対象の打刻が見つかりません（取消済みの可能性があります）' using errcode = 'P0002';
    end if;
    if not app.can_manage_clinic(target.clinic_id) and not (home = any (app.managed_clinic_ids()) or app.is_hq()) then
      raise exception '担当外の院の打刻は修正できません' using errcode = '42501';
    end if;
  end if;

  insert into public.attendance_adjustment_requests (
    staff_id, work_date, clinic_id, change_type, target_event_id, punch_type, requested_time,
    before, after, reason, status, requested_by, manager_approved_by, manager_approved_at
  ) values (
    p_staff_id, p_work_date, p_clinic_id, p_change_type, p_target_event_id,
    coalesce(nullif(p_punch_type, '')::public.punch_type, target.punch_type), p_requested_time,
    case when target.event_id is null then null
         else jsonb_build_object('punch_type', target.punch_type, 'punched_at', target.punched_at, 'clinic_id', target.clinic_id) end,
    case when p_change_type = 'void' then null
         else jsonb_build_object('punch_type', coalesce(nullif(p_punch_type, ''), target.punch_type::text), 'punched_at', p_requested_time, 'clinic_id', p_clinic_id) end,
    btrim(p_reason), 'manager_approved', auth.uid(), auth.uid(), now()
  )
  returning request_id into v_id;

  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('attendance_adjustment_requests', v_id, p_clinic_id, 'manager', 'request', auth.uid(), btrim(p_reason));
  return v_id;
end;
$$;

-- 打刻修正の最終承認（本部のみ）。打刻原本は書き換えず、取消レコードと新しい打刻を追記する
create or replace function public.approve_attendance_adjustment(p_request_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.attendance_adjustment_requests;
  target public.raw_punch_events;
  applied uuid[] := '{}';
  new_id uuid;
  home uuid;
begin
  if not app.is_hq() then
    raise exception '打刻修正の最終承認は本部のみ可能です' using errcode = '42501';
  end if;
  select * into req from public.attendance_adjustment_requests where request_id = p_request_id for update;
  if req.request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if req.status <> 'manager_approved' then
    raise exception 'この申請は既に処理済みです' using errcode = '22023';
  end if;
  home := app.staff_primary_clinic_id(req.staff_id, req.work_date);
  if app.is_month_closed(coalesce(home, req.clinic_id), req.work_date) then
    raise exception '締め済みの月の打刻は修正できません（本部による締めの再開が必要です）' using errcode = 'P0001';
  end if;

  if req.change_type in ('void', 'replace') then
    select * into target from app.effective_punches e where e.event_id = req.target_event_id;
    if target.event_id is null then
      raise exception '修正対象の打刻は既に取り消されています' using errcode = '22023';
    end if;
    insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source,
                                         adjustment_request_id, is_void, void_of_event_id, created_by)
    values (target.staff_id, target.clinic_id, target.home_clinic_id, target.punch_type, target.punched_at, 'adjustment',
            req.request_id, true, target.event_id, auth.uid())
    returning event_id into new_id;
    applied := applied || new_id;
  end if;
  if req.change_type in ('add', 'replace') then
    insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source,
                                         adjustment_request_id, created_by)
    values (req.staff_id, req.clinic_id, home, req.punch_type, req.requested_time, 'adjustment', req.request_id, auth.uid())
    returning event_id into new_id;
    applied := applied || new_id;
  end if;

  update public.attendance_adjustment_requests
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), applied_event_ids = applied
   where request_id = req.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('attendance_adjustment_requests', req.request_id, req.clinic_id, 'hq', 'approve', auth.uid(), p_comment);

  perform app.recalc_attendance(req.staff_id, req.work_date - 1, req.work_date + 1);
end;
$$;

-- 打刻修正の却下（本部、または申請院の院長による取り下げ）
create or replace function public.reject_attendance_adjustment(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.attendance_adjustment_requests;
begin
  select * into req from public.attendance_adjustment_requests where request_id = p_request_id for update;
  if req.request_id is null then
    raise exception '申請が見つかりません' using errcode = 'P0002';
  end if;
  if not app.can_manage_clinic(req.clinic_id) then
    raise exception 'この申請を却下する権限がありません' using errcode = '42501';
  end if;
  if req.status <> 'manager_approved' then
    raise exception 'この申請は既に処理済みです' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '却下の理由を入力してください' using errcode = '22023';
  end if;
  update public.attendance_adjustment_requests
     set status = case when app.is_hq() then 'rejected' else 'cancelled' end::public.adjustment_status,
         rejected_by = auth.uid(), rejected_at = now(), reject_reason = btrim(p_reason)
   where request_id = req.request_id;
  insert into public.approval_logs (target_table, target_id, clinic_id, step, action, actor_id, comment)
  values ('attendance_adjustment_requests', req.request_id, req.clinic_id,
          case when app.is_hq() then 'hq' else 'manager' end, case when app.is_hq() then 'reject' else 'cancel' end,
          auth.uid(), btrim(p_reason));
end;
$$;

-- 院の法定休日の登録（本部のみ）
create or replace function public.set_clinic_legal_holiday(p_clinic_id uuid, p_weekday smallint, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app.is_hq() then
    raise exception '法定休日の登録は本部のみ可能です' using errcode = '42501';
  end if;
  perform set_config('app.change_reason', coalesce(nullif(btrim(p_reason), ''), '法定休日の登録'), true);
  update public.clinics set legal_holiday_weekday = p_weekday where clinic_id = p_clinic_id;
end;
$$;

-- ===== 実行権限 =====
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
-- 計算・端末認証の内部関数はログインユーザーにも直接実行させない（RPC 経由のみ）
revoke execute on function app.recalc_attendance(uuid, date, date) from authenticated;
revoke execute on function app.kiosk_device_by_secret(text) from authenticated;
revoke execute on function app.random_token() from authenticated;

revoke all on function public.kiosk_register_device(text) from public;
revoke all on function public.kiosk_device_info(text) from public;
revoke all on function public.kiosk_authenticate(text, text, text) from public;
revoke all on function public.kiosk_punch(text, text, text, uuid, timestamptz) from public;
revoke all on function public.kiosk_change_pin(text, text, text) from public;
grant execute on function public.kiosk_register_device(text) to anon, authenticated;
grant execute on function public.kiosk_device_info(text) to anon, authenticated;
grant execute on function public.kiosk_authenticate(text, text, text) to anon, authenticated;
grant execute on function public.kiosk_punch(text, text, text, uuid, timestamptz) to anon, authenticated;
grant execute on function public.kiosk_change_pin(text, text, text) to anon, authenticated;

revoke all on function public.issue_kiosk_registration(uuid, text, uuid) from public, anon;
revoke all on function public.disable_kiosk_device(uuid) from public, anon;
revoke all on function public.set_kiosk_pin(uuid, text) from public, anon;
revoke all on function public.unlock_kiosk_pin(uuid) from public, anon;
revoke all on function public.kiosk_pin_status(uuid) from public, anon;
revoke all on function public.recalc_attendance(uuid, date, date) from public, anon;
revoke all on function public.confirm_attendance(uuid, date, date, uuid[]) from public, anon;
revoke all on function public.request_attendance_adjustment(uuid, date, uuid, text, uuid, text, timestamptz, text) from public, anon;
revoke all on function public.approve_attendance_adjustment(uuid, text) from public, anon;
revoke all on function public.reject_attendance_adjustment(uuid, text) from public, anon;
revoke all on function public.set_clinic_legal_holiday(uuid, smallint, text) from public, anon;
grant execute on function public.issue_kiosk_registration(uuid, text, uuid) to authenticated;
grant execute on function public.disable_kiosk_device(uuid) to authenticated;
grant execute on function public.set_kiosk_pin(uuid, text) to authenticated;
grant execute on function public.unlock_kiosk_pin(uuid) to authenticated;
grant execute on function public.kiosk_pin_status(uuid) to authenticated;
grant execute on function public.recalc_attendance(uuid, date, date) to authenticated;
grant execute on function public.confirm_attendance(uuid, date, date, uuid[]) to authenticated;
grant execute on function public.request_attendance_adjustment(uuid, date, uuid, text, uuid, text, timestamptz, text) to authenticated;
grant execute on function public.approve_attendance_adjustment(uuid, text) to authenticated;
grant execute on function public.reject_attendance_adjustment(uuid, text) to authenticated;
grant execute on function public.set_clinic_legal_holiday(uuid, smallint, text) to authenticated;
