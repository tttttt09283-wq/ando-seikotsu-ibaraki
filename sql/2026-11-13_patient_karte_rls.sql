-- patient_karte（カルテ基本情報）に RLS を設定する
--   これまで RLS が無効で、公開キー（anon）だけで誰でも読み書きできる状態だった。
--   karte.html はログイン中のスタッフのトークンで読み書きするため、
--   他のスタッフ用テーブルと同じく「ログイン中のスタッフ（is_staff）だけ」に限定する。
-- Supabase の SQL Editor で、整骨院の本番プロジェクトに対して実行する。

alter table public.patient_karte enable row level security;

revoke all on public.patient_karte from anon;
grant select, insert, update, delete on public.patient_karte to authenticated;

drop policy if exists patient_karte_staff_all on public.patient_karte;
create policy patient_karte_staff_all on public.patient_karte
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());
