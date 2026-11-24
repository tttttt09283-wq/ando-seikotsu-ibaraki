-- =====================================================================
-- Supabase 向けの追加の権限整理
--   Supabase は public スキーマの新しい関数・テーブルに、既定で anon / authenticated へ権限を付ける。
--   予約の作成・状態変更・期限切れ解放などの関数は、サーバー（DATABASE_URL）からだけ呼べるようにする。
-- =====================================================================
revoke all on function public.expire_stale_holds(timestamptz) from anon, authenticated;
revoke all on function public.reservation_conflict(text, text, timestamptz, timestamptz, uuid, boolean) from anon, authenticated;
revoke all on function public.create_reservation_hold(jsonb, jsonb, jsonb, jsonb, timestamptz) from anon, authenticated;
revoke all on function public.transition_reservation(uuid, text, int, jsonb, jsonb, timestamptz) from anon, authenticated;
revoke all on function public.propose_reservation_change(uuid, text, int, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, timestamptz) from anon, authenticated;
revoke all on function public.audit_logs_immutable() from public, anon, authenticated;
revoke all on function public.is_admin_for(text) from anon;
revoke all on all sequences in schema public from anon, authenticated;
-- 関数内で参照するオブジェクトを固定（search_path の書き換えによる乗っ取りを防ぐ）
alter function public.expire_stale_holds(timestamptz) set search_path = public, extensions;
alter function public.reservation_conflict(text, text, timestamptz, timestamptz, uuid, boolean) set search_path = public, extensions;
alter function public.create_reservation_hold(jsonb, jsonb, jsonb, jsonb, timestamptz) set search_path = public, extensions;
alter function public.transition_reservation(uuid, text, int, jsonb, jsonb, timestamptz) set search_path = public, extensions;
alter function public.propose_reservation_change(uuid, text, int, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, timestamptz) set search_path = public, extensions;
alter function public.audit_logs_immutable() set search_path = public;
