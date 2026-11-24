-- =====================================================================
-- 岩永拓己 鍼灸 予約管理  初期スキーマ
--   * 予約・顧客などすべての個人情報に「管理主体(controller)」と「施術場所(location_id)」を持たせる
--   * 管理主体と施術場所の組み合わせは複合外部キーで強制（事業をまたいだ紐づけをDBレベルで禁止）
--   * 同一施術者の時間帯重複は排他制約＋ロック付き関数で二重に防止
--   * 個人情報（氏名・電話・相談内容・LINEユーザーID）はアプリ側で AES-256-GCM 暗号化して保存
--   * RLS を全テーブルで有効化。anon（公開キー）には一切の権限を与えない
-- 日時は timestamptz（UTC）で保存し、Asia/Tokyo で表示・判定する
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 施術場所
-- ---------------------------------------------------------------------
create table public.locations (
  id text primary key check (id ~ '^[a-z0-9_-]{2,32}$'),
  controller text not null check (controller in ('iwanaga_private', 'enejoy_hand')),
  kind text not null check (kind in ('home', 'workplace')),
  name text not null,
  short_name text not null,
  public_area text not null default '',
  private_address text,                       -- 自宅院の詳細住所（確定した本人にだけ案内）
  is_active boolean not null default true,
  booking_enabled boolean not null default false,
  opening_ready boolean not null default false,          -- 自宅院：開業許可・準備完了
  company_approved boolean not null default false,       -- 勤務先：会社の正式承認
  company_approval_note text,
  company_approved_at timestamptz,
  company_approved_by text,
  buffer_minutes int not null default 15 check (buffer_minutes between 0 and 240),
  travel_minutes int not null default 0 check (travel_minutes between 0 and 480),
  booking_deadline_hours int not null default 24 check (booking_deadline_hours between 0 and 720),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  daily_limit int not null default 0 check (daily_limit between 0 and 50),  -- 0 = 上限なし
  slot_interval_minutes int not null default 30 check (slot_interval_minutes between 5 and 240),
  controller_name text not null,
  privacy_purpose text not null,
  privacy_access text not null,
  cancel_policy text not null default '',
  precautions text not null default '',
  contact_info text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, controller),
  -- 自宅院は岩永個人、勤務先は会社が管理主体
  constraint locations_controller_kind check (
    (kind = 'home' and controller = 'iwanaga_private') or (kind = 'workplace' and controller = 'enejoy_hand')
  ),
  -- 受付開始は「開業準備完了（自宅）」または「会社承認（勤務先）」が前提
  constraint locations_gate check (
    not booking_enabled
    or (kind = 'home' and opening_ready)
    or (kind = 'workplace' and company_approved and company_approved_at is not null)
  )
);

-- ---------------------------------------------------------------------
-- メニュー（場所別）
-- ---------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  location_id text not null,
  controller text not null,
  name text not null,
  description text not null default '',
  duration_minutes int not null check (duration_minutes between 10 and 240),
  price_tax_included int check (price_tax_included between 0 and 1000000),
  price_status text not null default 'proposed' check (price_status in ('proposed', 'approved')),
  price_approval_note text,
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (location_id, controller) references public.locations (id, controller),
  -- 料金未設定・未承認のメニューは公開できない（仮の料金を勝手に公開しない）
  constraint services_publish check (not is_published or (price_status = 'approved' and price_tax_included is not null))
);
create index services_location_idx on public.services (location_id, sort_order);

-- ---------------------------------------------------------------------
-- 営業時間・休業日・施術可能日時
--   weekday ルール = 毎週の営業時間 / specific_date ルール = 指定日の営業時間・休業日（曜日より優先）
-- ---------------------------------------------------------------------
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references public.locations (id),
  weekday smallint check (weekday between 0 and 6),
  specific_date date,
  start_time time,
  end_time time,
  is_closed boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  constraint rules_target check ((weekday is null) <> (specific_date is null)),
  constraint rules_times check (is_closed or (start_time is not null and end_time is not null and start_time < end_time))
);
create index availability_rules_location_idx on public.availability_rules (location_id);

-- ---------------------------------------------------------------------
-- 手動ブロック（location_id が null = 施術者本人の予定として全拠点をブロック）
-- ---------------------------------------------------------------------
create table public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  location_id text references public.locations (id),
  practitioner_key text not null default 'iwanaga',
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  check (start_at < end_at)
);
create index blocked_slots_range_idx on public.blocked_slots using gist (tstzrange(start_at, end_at, '[)'));

-- ---------------------------------------------------------------------
-- 顧客（施術場所ごとに別レコード。事業・院をまたいで名寄せしない）
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  controller text not null,
  location_id text not null,
  name_enc text not null,
  phone_enc text not null,
  phone_hash text not null,
  created_at timestamptz not null default now(),
  last_reserved_at timestamptz not null default now(),
  anonymized_at timestamptz,
  foreign key (location_id, controller) references public.locations (id, controller),
  unique (id, controller, location_id)
);
create unique index customers_phone_uniq on public.customers (location_id, phone_hash) where anonymized_at is null;

-- ---------------------------------------------------------------------
-- LINEアカウントの紐づけ（施術場所ごと）
-- ---------------------------------------------------------------------
create table public.line_accounts (
  id uuid primary key default gen_random_uuid(),
  controller text not null,
  location_id text not null,
  customer_id uuid not null,
  line_user_hash text not null,
  line_user_enc text not null,
  linked_via text not null check (linked_via in ('webhook', 'liff', 'manual')),
  created_at timestamptz not null default now(),
  foreign key (customer_id, controller, location_id) references public.customers (id, controller, location_id) on delete cascade,
  unique (location_id, line_user_hash),
  unique (customer_id)
);

-- ---------------------------------------------------------------------
-- 予約
-- ---------------------------------------------------------------------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^IW-[2-9A-HJ-NP-Z]{6}$'),
  controller text not null,
  location_id text not null,
  service_id uuid not null references public.services (id),
  customer_id uuid not null,
  practitioner_key text not null default 'iwanaga',
  status text not null check (status in ('draft','pending_line','pending_review','confirmed','change_proposed','cancelled','expired','completed')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  block_start_at timestamptz not null,
  block_end_at timestamptz not null,
  service_snapshot jsonb not null,
  consultation_enc text,
  source text,
  line_verify_hash text not null,
  view_token_hash text not null,
  liff_user_hash text,
  line_received_at timestamptz,
  line_match_method text check (line_match_method in ('webhook', 'manual')),
  hold_expires_at timestamptz,
  previous_start_at timestamptz,
  previous_end_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by text,
  cancelled_at timestamptz,
  cancel_reason text,
  completed_at timestamptz,
  notice_status text not null default 'none' check (notice_status in ('none','sent','failed','manual_required')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (location_id, controller) references public.locations (id, controller),
  foreign key (customer_id, controller, location_id) references public.customers (id, controller, location_id),
  check (start_at < end_at and block_start_at <= start_at and end_at <= block_end_at),
  -- 確定は管理者の承認とLINE受付（自動 or 手動照合）が前提
  constraint reservations_confirm_requires_admin check (status not in ('confirmed', 'completed') or (confirmed_at is not null and confirmed_by is not null)),
  constraint reservations_confirm_requires_line check (status not in ('pending_review', 'confirmed', 'completed') or line_received_at is not null),
  -- 同一施術者の時間帯の重複をDBで禁止（拠点をまたいでも）
  constraint reservations_no_overlap exclude using gist (
    practitioner_key with =,
    tstzrange(block_start_at, block_end_at, '[)') with &&
  ) where (status in ('pending_line', 'pending_review', 'confirmed', 'change_proposed'))
);
create index reservations_start_idx on public.reservations (start_at);
create index reservations_status_idx on public.reservations (status, hold_expires_at);
create index reservations_customer_idx on public.reservations (customer_id);

-- ---------------------------------------------------------------------
-- 同意記録
-- ---------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  customer_id uuid not null,
  controller text not null,
  location_id text not null,
  consent_type text not null check (consent_type in ('privacy', 'cancel_policy')),
  document_version text not null,
  agreed_at timestamptz not null default now(),
  foreign key (customer_id, controller, location_id) references public.customers (id, controller, location_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- 通知履歴（予約ステータスとは独立。失敗しても予約ステータスは変えない）
-- ---------------------------------------------------------------------
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations (id) on delete set null,
  controller text,
  location_id text references public.locations (id),
  channel text not null check (channel in ('line_push', 'line_reply', 'email', 'admin_panel', 'manual')),
  recipient text not null check (recipient in ('customer', 'admin')),
  kind text not null,
  status text not null check (status in ('sent', 'failed', 'skipped', 'manual_required')),
  summary text not null default '',
  error text,
  attempt int not null default 1,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_logs_created_idx on public.notification_logs (created_at desc);
create index notification_logs_reservation_idx on public.notification_logs (reservation_id);

-- ---------------------------------------------------------------------
-- 監査ログ（追記のみ。個人情報は入れない）
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('admin', 'customer', 'system', 'line_webhook')),
  actor_id text,
  controller text,
  location_id text,
  reservation_id uuid,
  action text not null,
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb
);
create index audit_logs_at_idx on public.audit_logs (at desc, seq desc);
create index audit_logs_reservation_idx on public.audit_logs (reservation_id);

create function public.audit_logs_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- ---------------------------------------------------------------------
-- 管理者
-- ---------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,       -- Supabase Auth の users.id
  email text not null unique,
  display_name text not null default '',
  role text not null default 'staff' check (role in ('owner', 'staff')),
  allowed_controllers text[] not null default array['iwanaga_private']::text[],
  can_export boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (allowed_controllers <@ array['iwanaga_private', 'enejoy_hand']::text[])
);

-- ---------------------------------------------------------------------
-- LINE Webhook のイベント重複排除
-- ---------------------------------------------------------------------
create table public.line_webhook_events (
  webhook_event_id text primary key,
  received_at timestamptz not null default now(),
  event_type text not null,
  result text not null default 'received'
);

-- =====================================================================
-- 関数
-- =====================================================================

-- 期限切れホールドの自動解放
create or replace function public.expire_stale_holds(p_now timestamptz default now())
returns setof public.reservations
language plpgsql as $$
declare r public.reservations;
begin
  for r in
    update public.reservations
       set status = 'expired', updated_at = p_now, version = version + 1
     where status in ('pending_line', 'pending_review', 'change_proposed')
       and hold_expires_at is not null and hold_expires_at <= p_now
    returning *
  loop
    insert into public.audit_logs (at, actor_type, actor_id, controller, location_id, reservation_id, action, from_status, to_status, detail)
    values (p_now, 'system', 'expire_stale_holds', r.controller, r.location_id, r.id, 'hold_expired', null, 'expired',
            jsonb_build_object('hold_expires_at', r.hold_expires_at));
    return next r;
  end loop;
end $$;

-- 候補時間が既存の予約・ブロックと衝突するか（null = 衝突なし）
create or replace function public.reservation_conflict(
  p_practitioner text, p_location text, p_start timestamptz, p_end timestamptz, p_exclude uuid, p_check_daily_limit boolean
) returns text
language plpgsql stable as $$
declare
  c_loc public.locations;
  v_count int;
begin
  select * into c_loc from public.locations where id = p_location;
  if not found then return 'no_location'; end if;

  if exists (
    select 1 from public.blocked_slots b
     where b.practitioner_key = p_practitioner
       and (b.location_id is null or b.location_id = p_location)
       and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end + make_interval(mins => c_loc.buffer_minutes), '[)')
  ) then return 'blocked'; end if;

  if exists (
    select 1
      from public.reservations r
      join public.locations l on l.id = r.location_id
     where r.practitioner_key = p_practitioner
       and r.status in ('pending_line', 'pending_review', 'confirmed', 'change_proposed')
       and (p_exclude is null or r.id <> p_exclude)
       and tstzrange(
             p_start,
             p_end + make_interval(mins => case when r.location_id = p_location then c_loc.buffer_minutes
                                                else c_loc.buffer_minutes + greatest(c_loc.travel_minutes, l.travel_minutes) end), '[)')
        && tstzrange(
             r.start_at,
             r.end_at + make_interval(mins => case when r.location_id = p_location then l.buffer_minutes
                                                  else l.buffer_minutes + greatest(c_loc.travel_minutes, l.travel_minutes) end), '[)')
  ) then return 'conflict'; end if;

  if p_check_daily_limit and c_loc.daily_limit > 0 then
    select count(*) into v_count from public.reservations r
     where r.location_id = p_location
       and r.status in ('pending_line', 'pending_review', 'confirmed', 'change_proposed')
       and (p_exclude is null or r.id <> p_exclude)
       and (r.start_at at time zone 'Asia/Tokyo')::date = (p_start at time zone 'Asia/Tokyo')::date;
    if v_count >= c_loc.daily_limit then return 'daily_limit'; end if;
  end if;
  return null;
end $$;

-- 仮予約（ホールド）の作成：ロック → 期限切れ解放 → 衝突判定 → 顧客・予約・同意・監査を一括保存
create or replace function public.create_reservation_hold(
  p_res jsonb, p_customer jsonb, p_consents jsonb, p_line jsonb, p_now timestamptz default now()
) returns jsonb
language plpgsql as $$
declare
  v_loc public.locations;
  v_svc public.services;
  v_customer_id uuid;
  v_res public.reservations;
  v_reason text;
  v_practitioner text := coalesce(p_res->>'practitioner_key', 'iwanaga');
  c jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('reservation:' || v_practitioner));
  perform public.expire_stale_holds(p_now);

  select * into v_loc from public.locations where id = p_res->>'location_id';
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_location'); end if;
  -- 受付可否はDBでも再確認（アプリの判定をすり抜けても受け付けない）
  if not (v_loc.is_active and v_loc.booking_enabled
          and ((v_loc.kind = 'home' and v_loc.opening_ready) or (v_loc.kind = 'workplace' and v_loc.company_approved))) then
    return jsonb_build_object('ok', false, 'reason', 'location_closed');
  end if;
  select * into v_svc from public.services where id = (p_res->>'service_id')::uuid and location_id = v_loc.id;
  if not found or not v_svc.is_published or v_svc.price_status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'service_unavailable');
  end if;

  v_reason := public.reservation_conflict(v_practitioner, v_loc.id, (p_res->>'start_at')::timestamptz, (p_res->>'end_at')::timestamptz, null, true);
  if v_reason is not null then return jsonb_build_object('ok', false, 'reason', v_reason); end if;

  -- 顧客（同じ施術場所・同じ電話番号なら再利用）
  select id into v_customer_id from public.customers
   where location_id = v_loc.id and phone_hash = p_customer->>'phone_hash' and anonymized_at is null;
  if v_customer_id is null then
    insert into public.customers (controller, location_id, name_enc, phone_enc, phone_hash, created_at, last_reserved_at)
    values (v_loc.controller, v_loc.id, p_customer->>'name_enc', p_customer->>'phone_enc', p_customer->>'phone_hash', p_now, p_now)
    returning id into v_customer_id;
  else
    update public.customers set name_enc = p_customer->>'name_enc', phone_enc = p_customer->>'phone_enc', last_reserved_at = p_now
     where id = v_customer_id;
  end if;

  insert into public.reservations (
    id, code, controller, location_id, service_id, customer_id, practitioner_key, status,
    start_at, end_at, block_start_at, block_end_at, service_snapshot, consultation_enc, source,
    line_verify_hash, view_token_hash, liff_user_hash, hold_expires_at, created_at, updated_at
  ) values (
    (p_res->>'id')::uuid, p_res->>'code', v_loc.controller, v_loc.id, v_svc.id, v_customer_id, v_practitioner, 'pending_line',
    (p_res->>'start_at')::timestamptz, (p_res->>'end_at')::timestamptz,
    (p_res->>'block_start_at')::timestamptz, (p_res->>'block_end_at')::timestamptz,
    p_res->'service_snapshot', p_res->>'consultation_enc', p_res->>'source',
    p_res->>'line_verify_hash', p_res->>'view_token_hash', p_res->>'liff_user_hash',
    (p_res->>'hold_expires_at')::timestamptz, p_now, p_now
  ) returning * into v_res;

  for c in select * from jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) loop
    insert into public.consents (reservation_id, customer_id, controller, location_id, consent_type, document_version, agreed_at)
    values (v_res.id, v_customer_id, v_loc.controller, v_loc.id, c->>'consent_type', c->>'document_version', p_now);
  end loop;

  if p_line is not null and p_line ? 'line_user_hash' then
    insert into public.line_accounts (controller, location_id, customer_id, line_user_hash, line_user_enc, linked_via)
    values (v_loc.controller, v_loc.id, v_customer_id, p_line->>'line_user_hash', p_line->>'line_user_enc', 'liff')
    on conflict do nothing;
  end if;

  insert into public.audit_logs (at, actor_type, actor_id, controller, location_id, reservation_id, action, from_status, to_status, detail)
  values (p_now, 'customer', null, v_loc.controller, v_loc.id, v_res.id, 'reservation_created', 'draft', 'pending_line',
          jsonb_build_object('code', v_res.code, 'source', v_res.source, 'liff', p_res->>'liff_user_hash' is not null));

  return jsonb_build_object('ok', true, 'reservation_id', v_res.id, 'customer_id', v_customer_id);
exception
  when exclusion_violation then return jsonb_build_object('ok', false, 'reason', 'conflict');
  when unique_violation then return jsonb_build_object('ok', false, 'reason', 'duplicate');
end $$;

-- 状態遷移（楽観ロック：期待するステータスとバージョンが一致したときだけ更新）＋監査ログ
create or replace function public.transition_reservation(
  p_id uuid, p_expected_status text, p_expected_version int, p_patch jsonb, p_audit jsonb, p_now timestamptz default now()
) returns public.reservations
language plpgsql as $$
declare
  cur public.reservations;
  nxt public.reservations;
begin
  select * into cur from public.reservations where id = p_id for update;
  if not found or cur.status <> p_expected_status or cur.version <> p_expected_version then
    return null;
  end if;
  nxt := jsonb_populate_record(cur, p_patch);
  update public.reservations set
    status = nxt.status,
    line_received_at = nxt.line_received_at,
    line_match_method = nxt.line_match_method,
    hold_expires_at = nxt.hold_expires_at,
    confirmed_at = nxt.confirmed_at,
    confirmed_by = nxt.confirmed_by,
    cancelled_at = nxt.cancelled_at,
    cancel_reason = nxt.cancel_reason,
    completed_at = nxt.completed_at,
    notice_status = nxt.notice_status,
    consultation_enc = nxt.consultation_enc,
    updated_at = p_now,
    version = cur.version + 1
  where id = p_id
  returning * into nxt;

  insert into public.audit_logs (at, actor_type, actor_id, controller, location_id, reservation_id, action, from_status, to_status, detail)
  values (p_now, p_audit->>'actor_type', p_audit->>'actor_id', cur.controller, cur.location_id, cur.id, p_audit->>'action',
          cur.status, nxt.status, coalesce(p_audit->'detail', '{}'::jsonb));
  return nxt;
end $$;

-- 日時変更の提案：ロック → 期限切れ解放 → 自分を除いて衝突判定 → 日時を更新
create or replace function public.propose_reservation_change(
  p_id uuid, p_expected_status text, p_expected_version int,
  p_start timestamptz, p_end timestamptz, p_block_end timestamptz, p_hold_expires timestamptz,
  p_audit jsonb, p_now timestamptz default now()
) returns jsonb
language plpgsql as $$
declare
  cur public.reservations;
  v_pk text;
  v_reason text;
begin
  select practitioner_key into v_pk from public.reservations where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform pg_advisory_xact_lock(hashtext('reservation:' || v_pk));
  perform public.expire_stale_holds(p_now);
  select * into cur from public.reservations where id = p_id for update;
  if cur.status <> p_expected_status or cur.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'stale');
  end if;
  v_reason := public.reservation_conflict(cur.practitioner_key, cur.location_id, p_start, p_end, cur.id, false);
  if v_reason is not null then return jsonb_build_object('ok', false, 'reason', v_reason); end if;

  update public.reservations set
    status = 'change_proposed',
    previous_start_at = cur.start_at,
    previous_end_at = cur.end_at,
    start_at = p_start, end_at = p_end, block_start_at = p_start, block_end_at = p_block_end,
    hold_expires_at = p_hold_expires,
    updated_at = p_now, version = cur.version + 1
  where id = p_id;

  insert into public.audit_logs (at, actor_type, actor_id, controller, location_id, reservation_id, action, from_status, to_status, detail)
  values (p_now, 'admin', p_audit->>'actor_id', cur.controller, cur.location_id, cur.id, 'change_proposed', cur.status, 'change_proposed',
          jsonb_build_object('from_start', cur.start_at, 'to_start', p_start) || coalesce(p_audit->'detail', '{}'::jsonb));
  return jsonb_build_object('ok', true);
exception
  when exclusion_violation then return jsonb_build_object('ok', false, 'reason', 'conflict');
end $$;

-- アプリ（サーバー）以外から関数を呼べないようにする
revoke all on function public.expire_stale_holds(timestamptz) from public;
revoke all on function public.reservation_conflict(text, text, timestamptz, timestamptz, uuid, boolean) from public;
revoke all on function public.create_reservation_hold(jsonb, jsonb, jsonb, jsonb, timestamptz) from public;
revoke all on function public.transition_reservation(uuid, text, int, jsonb, jsonb, timestamptz) from public;
revoke all on function public.propose_reservation_change(uuid, text, int, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, timestamptz) from public;

-- =====================================================================
-- RLS（多層防御）
--   サーバーは DATABASE_URL（テーブル所有者）で接続し、アプリ側で認可する。
--   公開キー（anon）からは何も読めない・書けない。
--   ログイン済みの管理者（authenticated）は、許可された管理主体の行だけ読める（書き込みはサーバー経由のみ）。
-- =====================================================================
create or replace function public.is_admin_for(p_controller text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users a
     where a.auth_user_id = auth.uid() and a.is_active and p_controller = any (a.allowed_controllers)
  );
$$;
revoke all on function public.is_admin_for(text) from public;
grant execute on function public.is_admin_for(text) to authenticated;

alter table public.locations enable row level security;
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.customers enable row level security;
alter table public.line_accounts enable row level security;
alter table public.reservations enable row level security;
alter table public.consents enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_users enable row level security;
alter table public.line_webhook_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.locations, public.services, public.availability_rules, public.blocked_slots,
                public.customers, public.line_accounts, public.reservations, public.consents,
                public.notification_logs, public.audit_logs, public.admin_users to authenticated;

create policy admin_read on public.locations for select to authenticated using (public.is_admin_for(controller));
create policy admin_read on public.services for select to authenticated using (public.is_admin_for(controller));
create policy admin_read on public.availability_rules for select to authenticated
  using (exists (select 1 from public.locations l where l.id = location_id and public.is_admin_for(l.controller)));
create policy admin_read on public.blocked_slots for select to authenticated
  using (location_id is null or exists (select 1 from public.locations l where l.id = location_id and public.is_admin_for(l.controller)));
create policy admin_read on public.customers for select to authenticated using (public.is_admin_for(controller));
create policy admin_read on public.line_accounts for select to authenticated using (public.is_admin_for(controller));
create policy admin_read on public.reservations for select to authenticated using (public.is_admin_for(controller));
create policy admin_read on public.consents for select to authenticated using (public.is_admin_for(controller));
create policy admin_read on public.notification_logs for select to authenticated using (controller is null or public.is_admin_for(controller));
create policy admin_read on public.audit_logs for select to authenticated using (controller is null or public.is_admin_for(controller));
create policy self_read on public.admin_users for select to authenticated using (auth_user_id = auth.uid());
