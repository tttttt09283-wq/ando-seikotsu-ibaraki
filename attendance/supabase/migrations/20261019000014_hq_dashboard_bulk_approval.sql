-- 0014: 本部の統合ダッシュボード（全院の勤怠集計）と一括承認
--
--   - attendance_summary：期間内の日次勤怠をスタッフ×主所属院で集計する。
--       security invoker のため RLS がそのまま効く（本部は全院、院長は担当院、スタッフは本人のみ）
--   - bulk_approve：複数院にまたがる承認待ちをまとめて本部承認する。
--       1件ずつ既存の承認関数を呼ぶ（権限・状態・締めのチェックは個別承認と同じ）。
--       承認履歴（approval_logs）は1件ごとに残し、同じ batch_id を付ける。
--       失敗した申請はその1件だけ取り消し、残りは承認する（結果に理由を返す）

-- ---------------------------------------------------------------------------
-- 一括承認の batch_id：承認関数の中の approval_logs 追加に、実行中の一括処理の ID を付ける
-- ---------------------------------------------------------------------------
create or replace function app.approval_logs_batch_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.batch_id is null then
    new.batch_id := nullif(current_setting('app.approval_batch_id', true), '')::uuid;
  end if;
  return new;
end;
$$;

create trigger approval_logs_batch_id
  before insert on public.approval_logs
  for each row execute function app.approval_logs_batch_id();

create index approval_logs_batch_idx on public.approval_logs (batch_id) where batch_id is not null;

-- ---------------------------------------------------------------------------
-- 一括承認（本部）
--   p_kind：attendance_adjustment（打刻修正の最終承認）／ leave（休暇の最終承認）／ holiday_credit（振休の承認）
-- ---------------------------------------------------------------------------
create or replace function public.bulk_approve(p_kind text, p_ids uuid[], p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_id uuid;
  v_ids uuid[];
  approved integer := 0;
  failures jsonb := '[]'::jsonb;
begin
  if not app.is_hq() then
    raise exception '一括承認は本部のみ可能です' using errcode = '42501';
  end if;
  if p_kind not in ('attendance_adjustment', 'leave', 'holiday_credit') then
    raise exception '一括承認の種類が正しくありません' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  if cardinality(v_ids) = 0 then
    raise exception '承認する申請を選んでください' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 200 then
    raise exception '一度に承認できるのは200件までです' using errcode = '22023';
  end if;

  perform set_config('app.approval_batch_id', v_batch::text, true);
  foreach v_id in array v_ids loop
    begin
      if p_kind = 'attendance_adjustment' then
        perform public.approve_attendance_adjustment(v_id, p_comment);
      elsif p_kind = 'leave' then
        perform public.approve_leave_final(v_id, p_comment);
      else
        perform public.approve_holiday_credit(v_id, p_comment);
      end if;
      approved := approved + 1;
    exception when others then
      -- この1件の変更だけ取り消される（サブトランザクション）
      failures := failures || jsonb_build_object('id', v_id, 'message', sqlerrm);
    end;
  end loop;
  perform set_config('app.approval_batch_id', '', true);

  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, after, reason)
  values (auth.uid(), 'user', 'bulk_approve',
          case p_kind when 'attendance_adjustment' then 'attendance_adjustment_requests'
                      when 'leave' then 'leave_requests' else 'holiday_credit_requests' end,
          jsonb_build_object('batch_id', v_batch, 'requested', cardinality(v_ids), 'approved', approved,
                             'failed', jsonb_array_length(failures)),
          p_comment);
  return jsonb_build_object('batch_id', v_batch, 'approved', approved, 'failed', failures);
end;
$$;

revoke all on function public.bulk_approve(text, uuid[], text) from public, anon;
grant execute on function public.bulk_approve(text, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 勤怠の集計（スタッフ × 主所属院）。RLS が効くよう security invoker
-- ---------------------------------------------------------------------------
create or replace function public.attendance_summary(p_from date, p_to date)
returns table (
  home_clinic_id                 uuid,
  staff_id                       uuid,
  work_days                      integer,
  worked_minutes                 integer,
  scheduled_minutes              integer,
  overtime_non_statutory_minutes integer,
  overtime_statutory_minutes     integer,
  late_night_minutes             integer,
  legal_holiday_minutes          integer,
  late_count                     integer,
  early_leave_count              integer,
  absent_count                   integer,
  missing_punch_count            integer,
  unconfirmed_days               integer,
  needs_recalc_days              integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception '集計期間は93日以内で指定してください' using errcode = '22023';
  end if;
  return query
  select d.home_clinic_id,
         d.staff_id,
         count(*) filter (where d.worked_minutes > 0)::integer,
         sum(d.worked_minutes)::integer,
         sum(d.scheduled_minutes)::integer,
         sum(d.overtime_non_statutory_minutes)::integer,
         sum(d.overtime_statutory_minutes)::integer,
         sum(d.late_night_minutes)::integer,
         sum(d.legal_holiday_minutes)::integer,
         count(*) filter (where d.late_minutes > 0)::integer,
         count(*) filter (where d.early_leave_minutes > 0)::integer,
         count(*) filter (where d.is_absent)::integer,
         count(*) filter (where d.has_missing_punch)::integer,
         count(*) filter (where d.status = 'open' and d.work_date < app.today_jst())::integer,
         count(*) filter (where d.needs_recalc)::integer
    from public.attendance_daily d
   where d.work_date between p_from and p_to
   group by d.home_clinic_id, d.staff_id;
end;
$$;

revoke all on function public.attendance_summary(date, date) from public, anon;
grant execute on function public.attendance_summary(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 残数一覧（有給・振休）。見られるスタッフ（本部は全員、院長は担当院の主所属）のみ
-- ---------------------------------------------------------------------------
create or replace function public.leave_balance_list(p_on date default null)
returns table (
  staff_id                  uuid,
  paid_balance              numeric,
  paid_reserved             numeric,
  holiday_credit_balance    numeric,
  holiday_credit_reserved   numeric,
  holiday_credit_expiring   date      -- 残っている振休のうち最も近い期限
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := coalesce(p_on, app.today_jst());
begin
  return query
    select s.staff_id,
           app.leave_available(s.staff_id, 'paid', d),
           app.leave_reserved(s.staff_id, 'paid'),
           app.leave_available(s.staff_id, 'holiday_credit', d),
           app.leave_reserved(s.staff_id, 'holiday_credit'),
           (select min(l.expiration_date)
              from public.holiday_credit_ledger l
             where l.staff_id = s.staff_id and l.entry_type = 'grant'
               and l.source_work_date <= d and l.expiration_date >= d
               and app.holiday_credit_bucket_remaining(l.holiday_credit_id) > 0)
      from public.staff_profiles s
     where s.status <> 'retired' and app.can_view_staff_private(s.staff_id);
end;
$$;

revoke all on function public.leave_balance_list(date) from public, anon;
grant execute on function public.leave_balance_list(date) to authenticated;
