-- 鍼灸臨床アカデミー：Supabase 導入時のテーブル案（未適用）
-- 学習記録のみを保存する。患者の個人情報は保存しない。

create table if not exists public.learning_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,               -- src/lib/repository/types.ts の LearningState
  updated_at timestamptz not null default now()
);

alter table public.learning_states enable row level security;

create policy "本人のみ参照" on public.learning_states
  for select using (auth.uid() = user_id);
create policy "本人のみ作成" on public.learning_states
  for insert with check (auth.uid() = user_id);
create policy "本人のみ更新" on public.learning_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 院内研修で集計が必要になったら、quiz_attempts などを正規化テーブルに分割する。
