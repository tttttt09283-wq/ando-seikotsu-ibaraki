-- AND GROUP MANAGEMENT SYSTEM — PHASE 7：院内会議・議事録・決定事項・タスク
-- 設計：docs/database.md §4.3、docs/workflows.md §6、requirements.md FR-MT・FR-TK
-- ・POSの public.meetings（会議）・public.action_items（行動計画・タスク）を拡張して共用する（列の追加のみ。既存の列・制約・RLSは変えない）
-- ・議事録の提出期限＝開催日の3日後の 23:59:59（日本時間・暦日）。会議の終了時刻からの72時間ではない
-- ・新システムからの読み書きはすべて mgmt の関数（SECURITY DEFINER）を通し、権限は mgmt.can で判定する
-- ・このマイグレーションより前からある会議は「対象外（移行前）」として期限管理をかけない（2026-11-10 の暫定の扱い）

do $$ begin
  if to_regclass('public.meetings') is null or to_regclass('public.action_items') is null then
    raise exception 'POSの public.meetings / public.action_items がありません（検証環境では supabase/tests/pos-stub.sql を先に適用）';
  end if;
end $$;

-- ===== 期限の計算 =====
-- 期限（表示用）：開催日＋3日の 23:59:59 JST
create or replace function mgmt.minutes_due_at(p_held_on date) returns timestamptz
language sql stable set search_path = '' as $$
  select ((p_held_on + 3)::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Asia/Tokyo'
$$;
-- 期限超過か：開催日＋4日の 0:00:00 JST 以降の提出（23:59:59.9 の提出は期限内）
create or replace function mgmt.minutes_is_late(p_held_on date, p_at timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_at >= ((p_held_on + 4)::timestamp at time zone 'Asia/Tokyo')
$$;
-- 会議の状態：scheduled（開催予定）／awaiting_minutes（議事録未提出）／submitted（提出済み）／overdue（期限超過）／exempt（対象外）
create or replace function mgmt.meeting_status(p_held_on date, p_submitted_at timestamptz, p_stored text) returns text
language sql stable set search_path = '' as $$
  select case
    when p_stored = 'exempt' then 'exempt'
    when p_submitted_at is not null then 'submitted'
    when mgmt.jst_today() < p_held_on then 'scheduled'
    when mgmt.minutes_is_late(p_held_on, now()) then 'overdue'
    else 'awaiting_minutes'
  end
$$;

-- POSの店舗・スタッフ → 新システムの店舗（POSの店舗の紐づけ → 作成者の所属が1院だけならその院）
create or replace function mgmt.store_from_pos(p_pos_store int, p_pos_staff int) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.id from mgmt.stores s where s.pos_store_id = p_pos_store),
    (select s.id from public.clinic_staff c join mgmt.stores s on s.pos_store_id = c.store_ids[1]
      where c.id = p_pos_staff and cardinality(c.store_ids) = 1)
  )
$$;

-- ===== public.meetings への追加列 =====
alter table public.meetings add column if not exists mgmt_store_id uuid references mgmt.stores(id);
alter table public.meetings add column if not exists minutes_due_at timestamptz;
alter table public.meetings add column if not exists minutes_status text not null default 'scheduled';
alter table public.meetings add column if not exists minutes_submitted_at timestamptz;
alter table public.meetings add column if not exists minutes_submitted_late boolean not null default false;
alter table public.meetings add column if not exists no_decisions boolean not null default false;
alter table public.meetings add constraint meetings_minutes_status_check
  check (minutes_status in ('scheduled','awaiting_minutes','submitted','overdue','exempt'));
create index if not exists meetings_mgmt_store_held on public.meetings (mgmt_store_id, held_on);

-- 会議の登録・開催日の変更のたびに期限・店舗・状態を設定（POSの画面から登録した会議にも効く）
create or replace function mgmt.meetings_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.minutes_due_at := mgmt.minutes_due_at(new.held_on);
  if new.mgmt_store_id is null then new.mgmt_store_id := mgmt.store_from_pos(new.store_id, new.created_by); end if;
  if new.minutes_status <> 'exempt' then
    new.minutes_status := mgmt.meeting_status(new.held_on, new.minutes_submitted_at, new.minutes_status);
    if new.minutes_submitted_at is not null then new.minutes_submitted_late := mgmt.minutes_is_late(new.held_on, new.minutes_submitted_at); end if;
  end if;
  return new;
end $$;
drop trigger if exists mgmt_meetings_before_write on public.meetings;
create trigger mgmt_meetings_before_write before insert or update on public.meetings
  for each row execute function mgmt.meetings_before_write();

-- 移行前からある会議は「対象外」（期限超過の通知を出さない）
update public.meetings set minutes_status = 'exempt';

-- ===== public.action_items への追加列 =====
alter table public.action_items add column if not exists is_decision boolean not null default false;
alter table public.action_items add column if not exists owner_user_id uuid references mgmt.users(id);
alter table public.action_items add column if not exists mgmt_store_id uuid references mgmt.stores(id);
create index if not exists action_items_owner_user on public.action_items (owner_user_id, status);
create index if not exists action_items_mgmt_store on public.action_items (mgmt_store_id, status);

-- 担当者（POSのスタッフ番号 ⇔ 新システムのユーザー）と店舗をそろえる
create or replace function mgmt.action_items_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_user_id is null and new.owner_staff_id is not null then
    select id into new.owner_user_id from mgmt.users where pos_staff_id = new.owner_staff_id;
  elsif new.owner_user_id is not null and (tg_op = 'INSERT' or new.owner_user_id is distinct from old.owner_user_id) then
    new.owner_staff_id := (select pos_staff_id from mgmt.users where id = new.owner_user_id);
  end if;
  if new.mgmt_store_id is null then
    new.mgmt_store_id := coalesce(
      (select m.mgmt_store_id from public.meetings m where m.id = new.meeting_id),
      mgmt.store_from_pos(new.store_id, new.created_by));
  end if;
  if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists mgmt_action_items_before_write on public.action_items;
create trigger mgmt_action_items_before_write before insert or update on public.action_items
  for each row execute function mgmt.action_items_before_write();
update public.action_items set mgmt_store_id = mgmt_store_id;  -- 既存の行にも店舗・担当者を反映

-- ===== 議事録・参加者・提出の版 =====
create table mgmt.meeting_minutes (
  meeting_id bigint primary key references public.meetings(id) on delete cascade,
  agenda text not null default '',
  content text not null default '',
  revision int not null default 0,              -- 正式提出の回数（1＝初回提出、2以降＝提出後の修正）
  submitted_by uuid references mgmt.users(id),
  updated_by uuid references mgmt.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger audit after insert or update or delete on mgmt.meeting_minutes for each row execute function mgmt.audit_trigger();

create table mgmt.meeting_attendees (
  id bigint generated always as identity primary key,
  meeting_id bigint not null references public.meetings(id) on delete cascade,
  user_id uuid references mgmt.users(id),
  guest_name text,
  check (num_nonnulls(user_id, guest_name) = 1),
  unique (meeting_id, user_id)
);
create index on mgmt.meeting_attendees (meeting_id);

-- 提出のたびに内容をそのまま保存（決定事項の担当・期限も含む）。修正の履歴になる
create table mgmt.meeting_minutes_revisions (
  id bigint generated always as identity primary key,
  meeting_id bigint not null references public.meetings(id) on delete cascade,
  revision int not null,
  snapshot jsonb not null,
  submitted_by uuid not null references mgmt.users(id),
  submitted_at timestamptz not null default now(),
  late boolean not null,
  unique (meeting_id, revision)
);

alter table mgmt.meeting_minutes enable row level security;
alter table mgmt.meeting_attendees enable row level security;
alter table mgmt.meeting_minutes_revisions enable row level security;
-- 直接の読み書きはさせない（すべて関数を通す）
revoke all on mgmt.meeting_minutes, mgmt.meeting_attendees, mgmt.meeting_minutes_revisions from anon, authenticated;
grant all on mgmt.meeting_minutes, mgmt.meeting_attendees, mgmt.meeting_minutes_revisions to service_role;

-- ===== 権限 =====
-- 見る：その院で会議を管理できる人・店舗のスタッフ情報を見られる人（社長・GM・担当BM）・その院の所属者・参加者。院が未設定の会議は全社の役職者だけ
create or replace function mgmt.can_view_meeting(p_meeting bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meetings m where m.id = p_meeting and (
      case when m.mgmt_store_id is null then mgmt.can('staff.view.all')
      else mgmt.can('meeting.manage', m.mgmt_store_id) or mgmt.can('staff.view.store', m.mgmt_store_id)
        or exists (select 1 from mgmt.user_store_assignments a where a.user_id = mgmt.current_user_id() and a.store_id = m.mgmt_store_id and mgmt.is_current(a.starts_on, a.ends_on))
      end
      or exists (select 1 from mgmt.meeting_attendees x where x.meeting_id = m.id and x.user_id = mgmt.current_user_id())
    )
  )
$$;
-- 書く：その院で会議を管理できる人（院長・GM・社長）。院が未設定なら全社の役職者（GM・社長）
create or replace function mgmt.can_edit_meeting(p_meeting bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meetings m where m.id = p_meeting and mgmt.can('meeting.manage', m.mgmt_store_id))
$$;

-- 会議・タスクで選べる人（その院に今所属している有効なユーザー）
create or replace function mgmt.store_members(p_store uuid) returns table (user_id uuid, name text, role_code text)
language sql stable security definer set search_path = '' as $$
  select distinct on (u.id) u.id, u.name, r.code
  from mgmt.user_store_assignments a
  join mgmt.users u on u.id = a.user_id and u.status = 'active'
  join mgmt.roles r on r.id = a.role_id
  where a.store_id = p_store and mgmt.is_current(a.starts_on, a.ends_on)
    and (mgmt.can('meeting.manage', p_store) or mgmt.can('task.manage.store', p_store))
  order by u.id, r.rank
$$;

-- ===== 会議 =====
create or replace function mgmt.create_meeting(p_store uuid, p_held_on date, p_title text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v_id bigint;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_store is null or not mgmt.can('meeting.manage', p_store) then raise exception '会議を登録できるのは、その院の院長・GM・社長です' using errcode = '42501'; end if;
  if p_held_on is null then raise exception '開催日を入力してください'; end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception '会議名を入力してください'; end if;
  insert into public.meetings (held_on, title, store_id, mgmt_store_id, created_by)
  values (p_held_on, left(btrim(p_title), 100), (select pos_store_id from mgmt.stores where id = p_store), p_store, (select pos_staff_id from mgmt.users where id = v_me))
  returning id into v_id;
  insert into mgmt.audit_logs (actor_user_id, action, table_name, record_id, after) values (v_me, 'INSERT', 'meetings', v_id::text, jsonb_build_object('held_on', p_held_on, 'title', p_title, 'store', p_store));
  return v_id;
end $$;

-- 開催日・会議名・院の変更（提出前だけ）
create or replace function mgmt.update_meeting(p_id bigint, p_held_on date, p_title text, p_store uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); m public.meetings;
begin
  select * into m from public.meetings where id = p_id for update;
  if m.id is null or not mgmt.can_view_meeting(p_id) then raise exception '会議が見つかりません'; end if;
  if not mgmt.can_edit_meeting(p_id) then raise exception 'この会議を変更する権限がありません' using errcode = '42501'; end if;
  if m.minutes_submitted_at is not null then raise exception '議事録を提出した会議の開催日・会議名は変更できません'; end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception '会議名を入力してください'; end if;
  if p_store is not null and p_store is distinct from m.mgmt_store_id and not mgmt.can('meeting.manage', p_store) then
    raise exception 'その院の会議にする権限がありません' using errcode = '42501';
  end if;
  update public.meetings set held_on = coalesce(p_held_on, held_on), title = left(btrim(p_title), 100),
    mgmt_store_id = coalesce(p_store, mgmt_store_id), store_id = coalesce((select pos_store_id from mgmt.stores where id = p_store), store_id)
  where id = p_id;
  insert into mgmt.audit_logs (actor_user_id, action, table_name, record_id, before, after)
  values (v_me, 'UPDATE', 'meetings', p_id::text, jsonb_build_object('held_on', m.held_on, 'title', m.title, 'store', m.mgmt_store_id),
    jsonb_build_object('held_on', coalesce(p_held_on, m.held_on), 'title', p_title, 'store', coalesce(p_store, m.mgmt_store_id)));
end $$;

-- 会議の削除（議事録を提出していない会議だけ。決定事項は会議とのつながりが外れる＝POSと同じ）
create or replace function mgmt.delete_meeting(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); m public.meetings;
begin
  select * into m from public.meetings where id = p_id for update;
  if m.id is null or not mgmt.can_view_meeting(p_id) then raise exception '会議が見つかりません'; end if;
  if not mgmt.can_edit_meeting(p_id) then raise exception 'この会議を削除する権限がありません' using errcode = '42501'; end if;
  if m.minutes_submitted_at is not null then raise exception '議事録を提出した会議は削除できません'; end if;
  delete from public.action_items where meeting_id = p_id and is_decision and status = 'todo' and progress = 0;
  delete from public.meetings where id = p_id;
  insert into mgmt.audit_logs (actor_user_id, action, table_name, record_id, before) values (v_me, 'DELETE', 'meetings', p_id::text, to_jsonb(m));
end $$;

-- 一覧（見られる会議だけ）
create or replace function mgmt.list_meetings(p_store uuid default null, p_from date default null, p_to date default null)
returns table (
  id bigint, held_on date, title text, store_id uuid, store_name text, status text, minutes_due_at timestamptz,
  minutes_submitted_at timestamptz, submitted_late boolean, decision_count int, open_decisions int, has_draft boolean, can_edit boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.held_on, m.title, m.mgmt_store_id, s.name, mgmt.meeting_status(m.held_on, m.minutes_submitted_at, m.minutes_status),
    m.minutes_due_at, m.minutes_submitted_at, m.minutes_submitted_late,
    (select count(*)::int from public.action_items a where a.meeting_id = m.id),
    (select count(*)::int from public.action_items a where a.meeting_id = m.id and a.status <> 'done'),
    exists (select 1 from mgmt.meeting_minutes mm where mm.meeting_id = m.id and mm.revision = 0 and (mm.agenda <> '' or mm.content <> '')),
    mgmt.can_edit_meeting(m.id)
  from public.meetings m
  left join mgmt.stores s on s.id = m.mgmt_store_id
  where (p_store is null or m.mgmt_store_id = p_store)
    and (p_from is null or m.held_on >= p_from) and (p_to is null or m.held_on <= p_to)
    and mgmt.can_view_meeting(m.id)
  order by m.held_on desc, m.id desc
  limit 300
$$;

-- 詳細（会議・議事録・参加者・決定事項／POSの行動計画）
create or replace function mgmt.get_meeting(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.meetings; v jsonb;
begin
  select * into m from public.meetings where id = p_id;
  if m.id is null or not mgmt.can_view_meeting(p_id) then return null; end if;
  select jsonb_build_object(
    'id', m.id, 'held_on', m.held_on, 'title', m.title, 'notes', m.notes, 'store_id', m.mgmt_store_id,
    'store_name', (select name from mgmt.stores where id = m.mgmt_store_id),
    'status', mgmt.meeting_status(m.held_on, m.minutes_submitted_at, m.minutes_status),
    'minutes_due_at', m.minutes_due_at, 'submitted_at', m.minutes_submitted_at, 'submitted_late', m.minutes_submitted_late,
    'no_decisions', m.no_decisions, 'can_edit', mgmt.can_edit_meeting(m.id), 'from_pos', m.created_by is not null and not exists (select 1 from mgmt.audit_logs l where l.table_name = 'meetings' and l.record_id = m.id::text and l.action = 'INSERT'),
    'minutes', (select jsonb_build_object('agenda', mm.agenda, 'content', mm.content, 'revision', mm.revision, 'updated_at', mm.updated_at,
                  'submitted_by_name', (select name from mgmt.users where id = mm.submitted_by)) from mgmt.meeting_minutes mm where mm.meeting_id = m.id),
    'attendees', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', coalesce(u.name, x.guest_name), 'guest', x.user_id is null) order by x.id)
                  from mgmt.meeting_attendees x left join mgmt.users u on u.id = x.user_id where x.meeting_id = m.id), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'detail', a.detail, 'owner_user_id', a.owner_user_id,
                  'owner_name', (select name from mgmt.users where id = a.owner_user_id), 'due_date', a.due_date, 'status', a.status,
                  'progress', a.progress, 'is_decision', a.is_decision) order by a.is_decision desc, a.id)
                  from public.action_items a where a.meeting_id = m.id), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object('revision', r.revision, 'submitted_at', r.submitted_at, 'late', r.late,
                  'submitted_by_name', (select name from mgmt.users where id = r.submitted_by)) order by r.revision)
                  from mgmt.meeting_minutes_revisions r where r.meeting_id = m.id), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- 議事録の保存（下書き）・正式提出・提出後の修正
-- p_decisions：[{ "id": 既存の決定事項のid|null, "title": 決定事項, "detail": 具体的な行動, "owner_user_id": 担当者, "due_date": 実施期限 }]
create or replace function mgmt.save_minutes(
  p_id bigint, p_agenda text, p_content text, p_attendees uuid[], p_guests text[], p_decisions jsonb, p_no_decisions boolean, p_submit boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := mgmt.current_user_id(); m public.meetings; mm mgmt.meeting_minutes; d jsonb; v_keep bigint[] := '{}'; v_aid bigint;
  v_owner uuid; v_due date; v_title text; v_detail text; v_guests text[]; v_late boolean; v_rev int; v_pos_store int; v_pos_me int;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  select * into m from public.meetings where id = p_id for update;
  if m.id is null or not mgmt.can_view_meeting(p_id) then raise exception '会議が見つかりません'; end if;
  if not mgmt.can_edit_meeting(p_id) then raise exception '議事録を書けるのは、その院の院長・GM・社長です' using errcode = '42501'; end if;
  if m.mgmt_store_id is null then raise exception '会議の院が設定されていません。先に院を設定してください'; end if;
  select * into mm from mgmt.meeting_minutes where meeting_id = p_id for update;
  if mm.revision > 0 and not p_submit then raise exception '提出済みの議事録は「修正して再提出」で保存してください'; end if;
  if jsonb_typeof(coalesce(p_decisions, '[]'::jsonb)) <> 'array' then raise exception '決定事項の形式が正しくありません'; end if;
  v_guests := array(select left(btrim(g), 50) from unnest(coalesce(p_guests, '{}')) g where length(btrim(g)) > 0);

  if p_submit then
    if mgmt.jst_today() < m.held_on then raise exception '開催日より前には提出できません（開催日：%）', m.held_on; end if;
    if p_agenda is null or length(btrim(p_agenda)) < 2 then raise exception '議題を入力してください'; end if;
    if p_content is null or length(btrim(p_content)) < 2 then raise exception '会議の内容を入力してください'; end if;
    if coalesce(cardinality(p_attendees), 0) + cardinality(v_guests) = 0 then raise exception '参加者を選んでください'; end if;
    if jsonb_array_length(coalesce(p_decisions, '[]'::jsonb)) = 0 and not coalesce(p_no_decisions, false) then
      raise exception '決定事項を入力するか、「決定事項なし」を選んでください';
    end if;
    if jsonb_array_length(coalesce(p_decisions, '[]'::jsonb)) > 0 and coalesce(p_no_decisions, false) then
      raise exception '「決定事項なし」を選んだときは、決定事項を空にしてください';
    end if;
  end if;
  if exists (select 1 from unnest(coalesce(p_attendees, '{}')) x where not exists (select 1 from mgmt.users u where u.id = x and u.status = 'active')) then
    raise exception '参加者に選べない人が含まれています';
  end if;

  -- 議事録
  insert into mgmt.meeting_minutes (meeting_id, agenda, content, updated_by)
  values (p_id, coalesce(btrim(p_agenda), ''), coalesce(btrim(p_content), ''), v_me)
  on conflict (meeting_id) do update set agenda = excluded.agenda, content = excluded.content, updated_by = v_me, updated_at = now();
  -- 参加者
  delete from mgmt.meeting_attendees where meeting_id = p_id;
  insert into mgmt.meeting_attendees (meeting_id, user_id) select distinct p_id, x from unnest(coalesce(p_attendees, '{}')) x;
  insert into mgmt.meeting_attendees (meeting_id, guest_name) select p_id, g from unnest(v_guests) g;

  -- 決定事項（public.action_items に is_decision=true で保存。POSの行動計画にも表示される）
  v_pos_store := (select pos_store_id from mgmt.stores where id = m.mgmt_store_id);
  v_pos_me := (select pos_staff_id from mgmt.users where id = v_me);
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    v_title := btrim(coalesce(d ->> 'title', ''));
    v_detail := btrim(coalesce(d ->> 'detail', ''));
    v_owner := nullif(d ->> 'owner_user_id', '')::uuid;
    v_due := nullif(d ->> 'due_date', '')::date;
    if length(v_title) < 2 then raise exception '決定事項の内容を入力してください'; end if;
    if p_submit then
      if length(v_detail) < 2 then raise exception '決定事項「%」の具体的な行動を入力してください', v_title; end if;
      if v_owner is null then raise exception '決定事項「%」の担当者を選んでください', v_title; end if;
      if v_due is null then raise exception '決定事項「%」の実施期限を入力してください', v_title; end if;
      if v_due < m.held_on then raise exception '決定事項「%」の実施期限が開催日より前です', v_title; end if;
    end if;
    if v_owner is not null and not exists (select 1 from mgmt.users u where u.id = v_owner and u.status = 'active') then
      raise exception '決定事項「%」の担当者に選べない人が指定されています', v_title;
    end if;
    v_aid := nullif(d ->> 'id', '')::bigint;
    if v_aid is not null then
      if not exists (select 1 from public.action_items where id = v_aid and meeting_id = p_id and is_decision) then raise exception '決定事項が見つかりません'; end if;
      update public.action_items set title = left(v_title, 200), detail = nullif(v_detail, ''), owner_user_id = v_owner, due_date = v_due, updated_at = now()
      where id = v_aid;
    else
      insert into public.action_items (title, detail, owner_user_id, due_date, meeting_id, source, is_decision, mgmt_store_id, store_id, created_by)
      values (left(v_title, 200), nullif(v_detail, ''), v_owner, v_due, p_id, 'meeting', true, m.mgmt_store_id, v_pos_store, v_pos_me)
      returning id into v_aid;
    end if;
    v_keep := v_keep || v_aid;
  end loop;
  -- 一覧から外した決定事項は削除（POSで登録した行動計画は消さない）
  delete from public.action_items where meeting_id = p_id and is_decision and not (id = any (v_keep));

  if not p_submit then
    update public.meetings set no_decisions = coalesce(p_no_decisions, false) where id = p_id;
    return mgmt.meeting_status(m.held_on, m.minutes_submitted_at, m.minutes_status);
  end if;

  -- 正式提出（初回は提出日時と期限超過かを記録。修正では最初の提出日時のまま）
  v_late := mgmt.minutes_is_late(m.held_on, now());
  update mgmt.meeting_minutes set revision = revision + 1, submitted_by = v_me where meeting_id = p_id returning revision into v_rev;
  update public.meetings set no_decisions = coalesce(p_no_decisions, false),
    minutes_submitted_at = coalesce(minutes_submitted_at, now()),
    minutes_status = case when minutes_status = 'exempt' then 'exempt' else 'submitted' end
  where id = p_id;
  insert into mgmt.meeting_minutes_revisions (meeting_id, revision, snapshot, submitted_by, late)
  values (p_id, v_rev, mgmt.get_meeting(p_id) - 'revisions' - 'can_edit', v_me, v_late);
  -- 決定事項の担当者に通知（同じ決定事項・同じ担当者には1回だけ）
  perform mgmt.notify(a.owner_user_id, 'task_assigned', '会議の決定事項の担当になりました：' || a.title,
    m.title || '（' || m.held_on || '）　期限 ' || a.due_date, '/tasks', 'task:' || a.id || ':assigned:' || a.owner_user_id)
  from public.action_items a where a.meeting_id = p_id and a.is_decision and a.owner_user_id is not null and a.owner_user_id <> v_me;
  return 'submitted';
end $$;

-- ===== タスク（決定事項＋院のタスク） =====
create or replace function mgmt.task_store_of(p_task bigint) returns uuid
language sql stable security definer set search_path = '' as $$ select mgmt_store_id from public.action_items where id = p_task $$;

-- 自分のタスク
create or replace function mgmt.my_tasks(p_include_done boolean default false)
returns table (id bigint, title text, detail text, due_date date, status text, progress int, progress_note text, priority text,
  is_decision boolean, meeting_id bigint, meeting_title text, meeting_held_on date, store_name text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.title, a.detail, a.due_date, a.status, a.progress, a.progress_note, a.priority, a.is_decision,
    a.meeting_id, m.title, m.held_on, s.name, a.updated_at
  from public.action_items a
  left join public.meetings m on m.id = a.meeting_id
  left join mgmt.stores s on s.id = a.mgmt_store_id
  where a.owner_user_id = mgmt.current_user_id()
    and (p_include_done or a.status <> 'done' or a.done_at > now() - interval '14 days')
  order by (a.status = 'done'), a.due_date nulls last, a.id
$$;

-- 院のタスク（院長・GM・社長）
create or replace function mgmt.store_tasks(p_store uuid, p_include_done boolean default false)
returns table (id bigint, title text, detail text, due_date date, status text, progress int, progress_note text, priority text,
  is_decision boolean, meeting_id bigint, meeting_title text, owner_user_id uuid, owner_name text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.title, a.detail, a.due_date, a.status, a.progress, a.progress_note, a.priority, a.is_decision,
    a.meeting_id, m.title, a.owner_user_id, u.name, a.updated_at
  from public.action_items a
  left join public.meetings m on m.id = a.meeting_id
  left join mgmt.users u on u.id = a.owner_user_id
  where a.mgmt_store_id = p_store and mgmt.can('task.manage.store', p_store)
    and (p_include_done or a.status <> 'done' or a.done_at > now() - interval '14 days')
  order by (a.status = 'done'), a.due_date nulls last, a.id
$$;

create or replace function mgmt.create_task(p_store uuid, p_title text, p_detail text, p_owner uuid, p_due date, p_priority text default 'mid') returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); v_id bigint;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  if p_store is null or not mgmt.can('task.manage.store', p_store) then raise exception 'タスクを登録できるのは、その院の院長・GM・社長です' using errcode = '42501'; end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception 'タスクの内容を入力してください'; end if;
  if p_owner is null or not exists (select 1 from mgmt.users where id = p_owner and status = 'active') then raise exception '担当者を選んでください'; end if;
  if coalesce(p_priority, 'mid') not in ('high','mid','low') then raise exception '優先度が正しくありません'; end if;
  insert into public.action_items (title, detail, owner_user_id, due_date, priority, source, mgmt_store_id, store_id, created_by)
  values (left(btrim(p_title), 200), nullif(btrim(coalesce(p_detail, '')), ''), p_owner, p_due, coalesce(p_priority, 'mid'), 'manual', p_store,
    (select pos_store_id from mgmt.stores where id = p_store), (select pos_staff_id from mgmt.users where id = v_me))
  returning id into v_id;
  if p_owner <> v_me then
    perform mgmt.notify(p_owner, 'task_assigned', 'タスクの担当になりました：' || left(btrim(p_title), 60), coalesce('期限 ' || p_due, '期限なし'), '/tasks', 'task:' || v_id || ':assigned:' || p_owner);
  end if;
  return v_id;
end $$;

-- 院長：タスクの内容・担当・期限の変更
create or replace function mgmt.update_task(p_id bigint, p_title text, p_detail text, p_owner uuid, p_due date, p_priority text default 'mid') returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); a public.action_items;
begin
  select * into a from public.action_items where id = p_id for update;
  if a.id is null or not mgmt.can('task.manage.store', a.mgmt_store_id) then raise exception 'タスクが見つかりません'; end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception 'タスクの内容を入力してください'; end if;
  if p_owner is null or not exists (select 1 from mgmt.users where id = p_owner and status = 'active') then raise exception '担当者を選んでください'; end if;
  if a.is_decision and p_due is null then raise exception '決定事項の実施期限は空にできません'; end if;
  update public.action_items set title = left(btrim(p_title), 200), detail = nullif(btrim(coalesce(p_detail, '')), ''), owner_user_id = p_owner,
    due_date = p_due, priority = coalesce(p_priority, priority), updated_at = now() where id = p_id;
  insert into mgmt.audit_logs (actor_user_id, action, table_name, record_id, before, after)
  values (v_me, 'UPDATE', 'action_items', p_id::text, to_jsonb(a), (select to_jsonb(x) from public.action_items x where x.id = p_id));
  if p_owner is distinct from a.owner_user_id and p_owner <> v_me then
    perform mgmt.notify(p_owner, 'task_assigned', 'タスクの担当になりました：' || left(btrim(p_title), 60), coalesce('期限 ' || p_due, '期限なし'), '/tasks', 'task:' || p_id || ':assigned:' || p_owner);
  end if;
end $$;

-- 担当者・院長：進み具合の更新（未着手 todo → 進行中 doing → 完了 done）
create or replace function mgmt.update_task_progress(p_id bigint, p_status text, p_progress int, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); a public.action_items;
begin
  if v_me is null then raise exception 'ログインし直してください' using errcode = '42501'; end if;
  select * into a from public.action_items where id = p_id for update;
  if a.id is null or not (a.owner_user_id = v_me or mgmt.can('task.manage.store', a.mgmt_store_id)) then raise exception 'タスクが見つかりません'; end if;
  if p_status not in ('todo','doing','done') then raise exception '状態が正しくありません'; end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then raise exception '進み具合は0〜100%%です'; end if;
  update public.action_items set status = p_status, progress = case p_status when 'done' then 100 when 'todo' then 0 else p_progress end,
    progress_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), progress_note), updated_at = now() where id = p_id;
end $$;

-- 院長：タスクの削除（会議の決定事項は議事録の修正で外す）
create or replace function mgmt.delete_task(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := mgmt.current_user_id(); a public.action_items;
begin
  select * into a from public.action_items where id = p_id for update;
  if a.id is null or not mgmt.can('task.manage.store', a.mgmt_store_id) then raise exception 'タスクが見つかりません'; end if;
  if a.is_decision then raise exception '会議の決定事項は、議事録の修正で外してください'; end if;
  delete from public.action_items where id = p_id;
  insert into mgmt.audit_logs (actor_user_id, action, table_name, record_id, before) values (v_me, 'DELETE', 'action_items', p_id::text, to_jsonb(a));
end $$;

-- ===== 定期処理（PHASE 9 の Vercel Cron から毎日 9:00 JST に呼ぶ。サービスロール専用） =====
-- 状態列（POSからも見える）を今の状態にそろえ、期限の前日・当日・超過の通知を出す。同じ通知は1回だけ（event_key）
create or replace function mgmt.run_minutes_reminders() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_updated int; v_notified int := 0; r record; v_today date := mgmt.jst_today(); v_n int;
begin
  update public.meetings set minutes_status = mgmt.meeting_status(held_on, minutes_submitted_at, minutes_status)
  where minutes_status in ('scheduled','awaiting_minutes','overdue') and minutes_status <> mgmt.meeting_status(held_on, minutes_submitted_at, minutes_status);
  get diagnostics v_updated = row_count;
  for r in
    select m.*, s.name store_name, s.area_id,
      case when mgmt.meeting_status(m.held_on, m.minutes_submitted_at, m.minutes_status) = 'overdue' then 'overdue'
           when m.held_on + 3 = v_today then 'd0' when m.held_on + 2 = v_today then 'd-1' end kind
    from public.meetings m join mgmt.stores s on s.id = m.mgmt_store_id
    where m.minutes_submitted_at is null and m.minutes_status <> 'exempt' and m.held_on <= v_today
  loop
    continue when r.kind is null;
    with recipients as (
      select x from mgmt.store_managers(r.mgmt_store_id) x
      union select u.id from mgmt.users u where u.pos_staff_id = r.created_by and u.status = 'active'
      union select ur.user_id from mgmt.user_roles ur join mgmt.roles ro on ro.id = ur.role_id and ro.code = 'BM'
            where r.kind = 'overdue' and ur.area_id = r.area_id and mgmt.is_current(ur.starts_on, ur.ends_on)
      union select x from mgmt.users_with_global_role('GM') x where r.kind = 'overdue'
    ), ins as (
      insert into mgmt.notifications (user_id, kind, title, body, link, event_key)
      select x, case r.kind when 'overdue' then 'minutes_overdue' else 'minutes_due' end,
        case r.kind when 'overdue' then '【期限超過】議事録が未提出です：' when 'd0' then '【本日期限】議事録の提出：' else '【明日期限】議事録の提出：' end || r.store_name || '「' || r.title || '」',
        '開催日 ' || r.held_on || '　提出期限 ' || to_char(r.minutes_due_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI'),
        '/meetings/' || r.id, 'minutes:' || r.id || ':' || case r.kind when 'overdue' then 'overdue' when 'd0' then 'due:d0' else 'due:d-1' end
      from recipients where x is not null
      on conflict (user_id, event_key) do nothing
      returning 1
    ) select count(*) into v_n from ins;
    v_notified := v_notified + v_n;
  end loop;
  return jsonb_build_object('status_updated', v_updated, 'notified', v_notified);
end $$;

-- ===== 実行権限 =====
revoke execute on all functions in schema mgmt from public, anon;
grant execute on function
  mgmt.minutes_due_at(date), mgmt.minutes_is_late(date, timestamptz), mgmt.meeting_status(date, timestamptz, text),
  mgmt.can_view_meeting(bigint), mgmt.can_edit_meeting(bigint), mgmt.store_members(uuid),
  mgmt.create_meeting(uuid, date, text), mgmt.update_meeting(bigint, date, text, uuid), mgmt.delete_meeting(bigint),
  mgmt.list_meetings(uuid, date, date), mgmt.get_meeting(bigint),
  mgmt.save_minutes(bigint, text, text, uuid[], text[], jsonb, boolean, boolean),
  mgmt.my_tasks(boolean), mgmt.store_tasks(uuid, boolean), mgmt.create_task(uuid, text, text, uuid, date, text),
  mgmt.update_task(bigint, text, text, uuid, date, text), mgmt.update_task_progress(bigint, text, int, text), mgmt.delete_task(bigint)
  to authenticated;
-- POSの画面（authenticated）から会議・行動計画を書いたときのトリガー
grant execute on function mgmt.meetings_before_write(), mgmt.action_items_before_write(), mgmt.store_from_pos(int, int) to authenticated;
grant execute on all functions in schema mgmt to service_role;
