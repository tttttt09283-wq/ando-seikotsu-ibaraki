-- 通信量を抑えるための「最後に変わった時刻」（適用済み）
-- 予約・会計・休憩は、画面が「前回から変わった分（updated_at）」だけを読み込む。更新・追加のたびに自動で今の時刻が入る
create or replace function public.set_sync_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
do $$ declare t text; begin
  foreach t in array array['bookings','payments','staff_breaks'] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format('update public.%I set updated_at = coalesce(created_at, now()) where updated_at is null', t);
    execute format('alter table public.%I alter column updated_at set default now()', t);
    execute format('alter table public.%I alter column updated_at set not null', t);
    execute format('drop trigger if exists trg_%s_sync_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_sync_updated_at before insert or update on public.%I for each row execute function public.set_sync_updated_at()', t, t);
    execute format('create index if not exists %s_updated_at_idx on public.%I (updated_at)', t, t);
  end loop;
end $$;
