-- 0001: 拡張機能と内部スキーマ
-- Supabase では pgcrypto / btree_gist は extensions スキーマに入れる慣例に従う。

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- app スキーマ：RLS 判定ヘルパーやトリガー関数を置く。PostgREST には公開しない。
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- 日本時間の「今日」。業務日付はすべて JST で判定する。
create or replace function app.today_jst()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Tokyo')::date
$$;

-- updated_at 自動更新
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 物理削除・改変を禁止するテーブル用
create or replace function app.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% は削除できません（休止・閉鎖・退職などの状態変更で管理してください）', tg_table_name
    using errcode = 'P0001';
end;
$$;

create or replace function app.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% は追記専用です（変更・削除はできません）', tg_table_name
    using errcode = 'P0001';
end;
$$;
