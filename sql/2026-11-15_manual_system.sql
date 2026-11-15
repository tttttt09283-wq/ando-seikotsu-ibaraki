-- あんど整骨院グループ 社内ルール・マニュアル・店舗管理システム（manual/）MVP-1
-- 予約管理と同じ Supabase プロジェクトに、頭に mn_ を付けたテーブルで追加する（既存テーブルには触れない）。
--
-- 守り方
--   * 読み書きはすべて manual/ のサーバー（DATABASE_URL で直接接続）から行い、権限はサーバー側で判定する。
--   * 全テーブルで RLS を有効にし、ポリシーは作らない ＝ anon / authenticated（ブラウザの Supabase キー）からは一切読めない。
--   * 監査ログ・承認の記録・原文は、トリガーで「追加のみ（書き換え・削除できない）」にする。
--   * 誰が操作したかは、サーバーがトランザクションの最初に set_config('mn.actor', <member id>, true) で渡す。
--
-- 何度流しても同じ結果になるように書いている（if not exists / or replace）。

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ===== 共通：操作者・日本時間の今日 =====
create or replace function public.mn_actor() returns text
language sql stable as $$ select nullif(current_setting('mn.actor', true), '') $$;

create or replace function public.mn_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

-- ===== 組織 =====
create table if not exists public.mn_clinics (
  id    text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name  text not null unique,
  sort  int  not null default 0
);
insert into public.mn_clinics (id, name, sort) values
  ('hirakata', '枚方本院', 1), ('taguchiyama', '田口山院', 2), ('tsuda', '津田院', 3), ('katano', '交野院', 4),
  ('ibaraki', '茨木院', 5), ('owada', '大和田院', 6), ('korien', '香里園院', 7)
on conflict (id) do nothing;

create table if not exists public.mn_members (
  id               uuid primary key default gen_random_uuid(),
  person_key       text unique,              -- 台帳の氏名（空白を除いたもの）。院ID＋個人PASSのログインと照合
  clinic_staff_id  integer unique,           -- 予約管理の clinic_staff.id（メールアドレスでログインする人）
  auth_uid         uuid unique,              -- Supabase Auth のユーザー
  name             text not null,
  employment_type  text not null default 'regular' check (employment_type in ('regular', 'part_time')),
  joined_on        date,
  retired_on       date,                     -- この日まで在籍。翌日からログインできない
  is_active        boolean not null default true,
  is_system_admin  boolean not null default false, -- clinic_staff.role = 'admin'（社長・本部）。管理者設定だけ使える
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.mn_assignments (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.mn_members (id),
  clinic_id   text references public.mn_clinics (id),  -- 社長・GM は null（全社）
  position    text not null check (position in ('president', 'gm', 'bm', 'manager', 'sub_manager', 'chief', 'staff', 'newcomer')),
  is_primary  boolean not null default true,
  valid_from  date not null default public.mn_today(),
  valid_to    date,                                     -- この日まで有効（null＝期限なし）
  created_at  timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check ((position in ('president', 'gm')) = (clinic_id is null))
);
create index if not exists mn_assignments_member on public.mn_assignments (member_id);

-- 担当エリア：その院の「マネージャー」（BM、BMがいない院は GM）
create table if not exists public.mn_areas (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.mn_members (id),
  clinic_id   text not null references public.mn_clinics (id),
  valid_from  date not null default public.mn_today(),
  valid_to    date,
  created_at  timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

-- 代理承認（MVP-1 では「GM確認」の代理のみ）
create table if not exists public.mn_delegations (
  id            uuid primary key default gen_random_uuid(),
  from_member   uuid not null references public.mn_members (id),
  to_member     uuid not null references public.mn_members (id),
  permission    text not null check (permission in ('gm_review')),
  valid_from    date not null,
  valid_to      date not null,
  reason        text not null default '',
  created_at    timestamptz not null default now(),
  check (from_member <> to_member and valid_to >= valid_from)
);

-- ===== 原文の取り込み =====
create table if not exists public.mn_source_imports (
  id           uuid primary key default gen_random_uuid(),
  source_name  text not null,               -- 例：Googleドキュメント「整骨院スタッフ業務・行動マニュアル」
  source_id    text not null default '',    -- 例：Googleドキュメントの ID
  sha256       text not null,
  imported_by  uuid references public.mn_members (id),
  imported_at  timestamptz not null default now()
);
create table if not exists public.mn_source_sections (
  id         uuid primary key default gen_random_uuid(),
  import_id  uuid not null references public.mn_source_imports (id),
  ref        text not null,                 -- S01〜S48
  heading    text not null,
  text       text not null,                 -- 原文（そのまま）
  unique (import_id, ref)
);

-- ===== ルール・マニュアル =====
create table if not exists public.mn_docs (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[A-Z]{3,4}-[A-Z0-9]{2,4}(-[0-9]{3})?$'),
  kind                text not null check (kind in ('rule', 'staff_manual', 'manager_manual', 'training')),
  source              text not null check (source in ('google_doc', 'proposal')),
  source_ref          text,                 -- 分析書の項目ID（S01 など）
  import_note         text not null default '', -- 取り込み時の注意（法令確認が必要な理由など）
  current_version_id  uuid,                 -- 公開中の版（なければ未公開）
  created_by          uuid references public.mn_members (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.mn_doc_versions (
  id                uuid primary key default gen_random_uuid(),
  doc_id            uuid not null references public.mn_docs (id),
  version_no        int  not null,
  status            text not null check (status in ('draft', 'returned', 'gm_review', 'president_approval', 'legal_hold', 'published', 'superseded', 'archived')),
  title             text not null check (length(title) between 1 and 120),
  body              text not null check (length(body) between 1 and 20000),
  original_text     text,                   -- 原文（取り込んだまま。変更できない）
  category          text not null check (category in ('attendance', 'paid_leave', 'substitute_holiday', 'part_time', 'shift', 'communication', 'meeting', 'service', 'treatment_insurance', 'privacy_sns', 'money', 'complaint_accident', 'education', 'other')),
  importance        text not null check (importance in ('A', 'B', 'C')),
  target_positions  text[] not null default '{}',  -- 空＝全員
  target_clinics    text[] not null default '{}',  -- 空＝全院
  effective_on      date,
  change_summary    text not null default '',
  requires_reack    boolean not null default true,
  published_at      timestamptz,
  created_by        uuid references public.mn_members (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (doc_id, version_no)
);
create index if not exists mn_doc_versions_status on public.mn_doc_versions (status);
create index if not exists mn_doc_versions_title_trgm on public.mn_doc_versions using gin (title extensions.gin_trgm_ops);
create index if not exists mn_doc_versions_body_trgm on public.mn_doc_versions using gin (body extensions.gin_trgm_ops);

do $$ begin
  alter table public.mn_docs add constraint mn_docs_current_version_fk foreign key (current_version_id) references public.mn_doc_versions (id);
exception when duplicate_object then null; end $$;

-- 承認の記録（追加のみ）
create table if not exists public.mn_doc_reviews (
  id                   uuid primary key default gen_random_uuid(),
  version_id           uuid not null references public.mn_doc_versions (id),
  action               text not null check (action in ('submit', 'gm_approve', 'president_approve', 'return', 'legal_hold', 'legal_clear', 'archive')),
  from_status          text not null,
  to_status            text not null,
  actor_id             uuid references public.mn_members (id),
  via_delegation_of    uuid references public.mn_members (id),
  comment              text not null default '',
  external_reviewer    text,                -- 社労士など社外の確認者
  external_checked_on  date,
  created_at           timestamptz not null default now()
);
create index if not exists mn_doc_reviews_version on public.mn_doc_reviews (version_id);

-- 原文と新規提案の矛盾（open の間、提案の版は公開できない）
create table if not exists public.mn_doc_conflicts (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references public.mn_doc_versions (id),
  conflicts_with   uuid not null references public.mn_docs (id),
  note             text not null,
  status           text not null default 'open' check (status in ('open', 'resolved')),
  resolution       text,
  resolved_by      uuid references public.mn_members (id),
  resolved_at      timestamptz,
  created_by       uuid references public.mn_members (id),
  created_at       timestamptz not null default now()
);

create table if not exists public.mn_doc_links (
  from_doc   uuid not null references public.mn_docs (id),
  to_doc     uuid references public.mn_docs (id),
  form_type  text check (form_type in ('paid_leave', 'day_swap', 'comp_day', 'part_time_work')),
  relation   text not null check (relation in ('related_manual', 'related_rule', 'related_form', 'source_section')),
  created_at timestamptz not null default now(),
  check ((to_doc is null) <> (form_type is null))
);
create unique index if not exists mn_doc_links_uniq on public.mn_doc_links (from_doc, coalesce(to_doc::text, form_type), relation);

-- 確認済み（版ごと）
create table if not exists public.mn_doc_acks (
  version_id  uuid not null references public.mn_doc_versions (id),
  member_id   uuid not null references public.mn_members (id),
  acked_at    timestamptz not null default now(),
  primary key (version_id, member_id)
);

create table if not exists public.mn_search_synonyms (
  term       text primary key,
  canonical  text not null
);
insert into public.mn_search_synonyms (term, canonical) values
  ('有休', '有給'), ('年休', '有給'), ('有給休暇', '有給'), ('口コミ', 'クチコミ'), ('くちこみ', 'クチコミ'), ('レビュー', 'クチコミ'),
  ('遅れる', '遅刻'), ('休む', '欠席'), ('欠勤', '欠席'), ('次回予約', '次回'), ('予約', '次回'), ('服装', '身だしなみ'),
  ('清掃', '掃除'), ('事故', 'トラブル'), ('クレーム', 'OD'), ('会計', 'レジ'), ('備品', '在庫'), ('新人', 'ブラザー')
on conflict (term) do nothing;

-- ===== 通知・監査 =====
create table if not exists public.mn_notifications (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.mn_members (id),
  kind        text not null,
  title       text not null,
  link        text not null default '/',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists mn_notifications_member on public.mn_notifications (member_id, read_at);

create table if not exists public.mn_audit_log (
  id          bigint generated always as identity primary key,
  actor       text,
  action      text not null,
  table_name  text not null,
  row_id      text,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index if not exists mn_audit_log_at on public.mn_audit_log (at desc);

-- ===== トリガー =====
-- 監査ログ：mn_ テーブルの追加・変更・削除をすべて記録
create or replace function public.mn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.mn_audit_log (actor, action, table_name, row_id, before, after)
  values (
    public.mn_actor(), lower(tg_op), tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', concat_ws(':', to_jsonb(new) ->> 'version_id', to_jsonb(new) ->> 'member_id')),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- 追加のみ（書き換え・削除を禁止）
create or replace function public.mn_append_only() returns trigger
language plpgsql as $$
begin
  raise exception '% は追加のみです（変更・削除はできません）', tg_table_name using errcode = 'P0001';
end $$;

create or replace function public.mn_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- 版：原文は変えられない。公開後の版は内容を変えられない（状態の 公開→旧版／廃止 だけ）
create or replace function public.mn_guard_version() returns trigger
language plpgsql as $$
begin
  if new.original_text is distinct from old.original_text then
    raise exception '原文は変更できません' using errcode = 'P0001';
  end if;
  if new.doc_id <> old.doc_id or new.version_no <> old.version_no then
    raise exception '版の番号は変更できません' using errcode = 'P0001';
  end if;
  if old.status in ('published', 'superseded', 'archived') then
    if (new.title, new.body, new.category, new.importance, new.target_positions, new.target_clinics, new.effective_on, new.requires_reack)
       is distinct from (old.title, old.body, old.category, old.importance, old.target_positions, old.target_clinics, old.effective_on, old.requires_reack) then
      raise exception '公開済みの版は変更できません。改訂は新しい版で行ってください' using errcode = 'P0001';
    end if;
    if not (old.status = new.status or (old.status = 'published' and new.status in ('superseded', 'archived'))) then
      raise exception '公開済みの版の状態は「旧版」「廃止」にしか変えられません' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- 公開できるのは社長承認待ちからだけ。矛盾が未解決なら公開できない
create or replace function public.mn_guard_publish() returns trigger
language plpgsql as $$
begin
  if new.status = 'published' and old.status <> 'published' then
    if old.status <> 'president_approval' then
      raise exception '社長承認待ちの版だけが公開できます' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.mn_doc_conflicts c where c.version_id = new.id and c.status = 'open') then
      raise exception '既存ルールとの矛盾が解決されていないため公開できません（GM確認待ち）' using errcode = 'P0001';
    end if;
    new.published_at := now();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['mn_clinics', 'mn_members', 'mn_assignments', 'mn_areas', 'mn_delegations', 'mn_source_imports', 'mn_source_sections',
    'mn_docs', 'mn_doc_versions', 'mn_doc_reviews', 'mn_doc_conflicts', 'mn_doc_links', 'mn_doc_acks', 'mn_search_synonyms']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.mn_audit()', t || '_audit', t);
  end loop;
  foreach t in array array['mn_audit_log', 'mn_doc_reviews', 'mn_source_sections', 'mn_doc_acks']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.mn_append_only()', t || '_append_only', t);
  end loop;
  foreach t in array array['mn_members', 'mn_docs', 'mn_doc_versions']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.mn_touch()', t || '_touch', t);
  end loop;
end $$;

drop trigger if exists mn_doc_versions_guard on public.mn_doc_versions;
create trigger mn_doc_versions_guard before update on public.mn_doc_versions for each row execute function public.mn_guard_version();
drop trigger if exists mn_doc_versions_publish on public.mn_doc_versions;
create trigger mn_doc_versions_publish before update on public.mn_doc_versions for each row execute function public.mn_guard_publish();

-- 監査ログは書き換え不可（TRUNCATE も禁止）
drop trigger if exists mn_audit_log_no_truncate on public.mn_audit_log;
create trigger mn_audit_log_no_truncate before truncate on public.mn_audit_log execute function public.mn_append_only();

-- ===== 検索 =====
-- 言い換え辞書で語を足し、タイトル・本文を部分一致で探す（2文字の「有給」「遅刻」も探せるよう ILIKE を使う）
create or replace function public.mn_search_terms(q text) returns text[]
language sql stable as $$
  with words as (
    select distinct w from regexp_split_to_table(btrim(coalesce(q, '')), '[\s　]+') as w where w <> ''
  )
  select coalesce(array_agg(distinct x), '{}') from (
    select w as x from words
    union select s.canonical from public.mn_search_synonyms s join words on s.term = words.w
  ) t
$$;

-- ===== アクセス制限 =====
do $$
declare t text;
begin
  foreach t in array array['mn_clinics', 'mn_members', 'mn_assignments', 'mn_areas', 'mn_delegations', 'mn_source_imports', 'mn_source_sections',
    'mn_docs', 'mn_doc_versions', 'mn_doc_reviews', 'mn_doc_conflicts', 'mn_doc_links', 'mn_doc_acks', 'mn_search_synonyms', 'mn_notifications', 'mn_audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.mn_search_terms(text), public.mn_actor(), public.mn_today() from anon, authenticated;
  end if;
end $$;
