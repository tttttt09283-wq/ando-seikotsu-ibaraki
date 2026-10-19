-- 0013: 有給残数の取込（月末残数形式：出勤簿・残業代計算表のように「氏名・有給残」だけがある表）
--
--   - 画面側で氏名をスタッフに照合し、付与日が分からない残数は入社日から推定した法定の付与に振り分けた計画（plan）を渡す
--   - その月末時点の残数と比べて：
--       有効な付与が無い → 計画どおり「移行」の付与を登録
--       残数が多い       → 期限の最も遅い付与に「調整（＋）」
--       残数が少ない     → 期限の近い付与から「調整（−）」
--       同じ             → 変更なし
--   - 同じ表を何度取り込んでも結果は同じ。1件でもエラーがあれば全件取り消し

create or replace function public.import_paid_leave_snapshot(p_rows jsonb, p_as_of date, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  plan_item jsonb;
  v_staff uuid;
  v_row integer;
  v_target numeric;
  v_current numeric;
  v_diff numeric;
  v_need numeric;
  v_take numeric;
  v_plan_total numeric;
  v_id uuid;
  g record;
  created integer := 0;
  adjusted integer := 0;
  unchanged integer := 0;
  note text := 'Excel取込（' || to_char(p_as_of, 'YYYY-MM-DD') || '時点の残数）：' || coalesce(nullif(btrim(p_source), ''), 'ファイル名なし');
begin
  if not app.is_hq() then
    raise exception '有給残数の取込は本部のみ可能です' using errcode = '42501';
  end if;
  if p_as_of is null or p_as_of > app.today_jst() + 31 then
    raise exception '残数の基準日が正しくありません' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '取り込む行がありません' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_rows) loop
    v_row := (item ->> 'row')::integer;
    v_staff := (item ->> 'staff_id')::uuid;
    v_target := (item ->> 'remaining_days')::numeric;
    if not exists (select 1 from public.staff_profiles where staff_id = v_staff) then
      raise exception '%行目：スタッフが見つかりません', v_row using errcode = '22023';
    end if;
    if v_target is null or v_target < 0 or v_target > 80 or (v_target * 2) <> floor(v_target * 2) then
      raise exception '%行目：有給残は0.5日単位の数値にしてください', v_row using errcode = '22023';
    end if;

    perform 1 from public.staff_profiles where staff_id = v_staff for update;
    v_current := app.leave_available(v_staff, 'paid', p_as_of);
    v_diff := v_target - v_current;

    if v_diff = 0 then
      unchanged := unchanged + 1;
    elsif v_diff > 0 and not exists (
      select 1 from public.leave_grants lg where lg.staff_id = v_staff and lg.grant_date <= p_as_of and lg.expiration_date >= p_as_of
    ) then
      -- 有効な付与が無い：画面で推定した付与の計画どおりに「移行」として登録
      select coalesce(sum((p ->> 'days')::numeric), 0) into v_plan_total from jsonb_array_elements(item -> 'plan') p;
      if v_plan_total <> v_diff then
        raise exception '%行目：付与の振り分け（計 % 日）が残数（% 日）と一致しません', v_row, v_plan_total, v_diff using errcode = '22023';
      end if;
      for plan_item in select * from jsonb_array_elements(item -> 'plan') loop
        if (plan_item ->> 'grant_date')::date > p_as_of or (plan_item ->> 'expiration_date')::date < p_as_of then
          raise exception '%行目：振り分け先の付与が基準日に有効ではありません', v_row using errcode = '22023';
        end if;
        insert into public.leave_grants (staff_id, grant_date, granted_days, expiration_date, grant_type, annual_5day_target, note, created_by)
        values (v_staff, (plan_item ->> 'grant_date')::date, (plan_item ->> 'days')::numeric, (plan_item ->> 'expiration_date')::date,
                'migration', false, note, auth.uid())
        returning leave_grant_id into v_id;
        insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
        values (v_staff, v_id, 'grant', (plan_item ->> 'days')::numeric, (plan_item ->> 'grant_date')::date, note || '（残数を移行）', auth.uid());
      end loop;
      created := created + 1;
    elsif v_diff > 0 then
      select lg.leave_grant_id into v_id
        from public.leave_grants lg
       where lg.staff_id = v_staff and lg.grant_date <= p_as_of and lg.expiration_date >= p_as_of
       order by lg.expiration_date desc, lg.grant_date desc
       limit 1;
      insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
      values (v_staff, v_id, 'adjust', v_diff, p_as_of, note || '（最新データとの差分を調整）', auth.uid());
      adjusted := adjusted + 1;
    else
      v_need := -v_diff;
      for g in
        select lg.leave_grant_id, app.leave_grant_remaining(lg.leave_grant_id) as remaining
          from public.leave_grants lg
         where lg.staff_id = v_staff and lg.grant_date <= p_as_of and lg.expiration_date >= p_as_of
         order by lg.expiration_date, lg.grant_date
      loop
        exit when v_need <= 0;
        continue when g.remaining <= 0;
        v_take := least(v_need, g.remaining);
        insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, note, created_by)
        values (v_staff, g.leave_grant_id, 'adjust', -v_take, p_as_of, note || '（最新データとの差分を調整）', auth.uid());
        v_need := v_need - v_take;
      end loop;
      adjusted := adjusted + 1;
    end if;
  end loop;

  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, after, reason, is_backdated)
  values (auth.uid(), 'user', 'import_snapshot', 'leave_grants',
          jsonb_build_object('rows', jsonb_array_length(p_rows), 'as_of', p_as_of, 'created', created, 'adjusted', adjusted, 'unchanged', unchanged),
          note, p_as_of < app.today_jst());
  return jsonb_build_object('created', created, 'adjusted', adjusted, 'unchanged', unchanged);
end;
$$;

revoke all on function public.import_paid_leave_snapshot(jsonb, date, text) from public, anon;
grant execute on function public.import_paid_leave_snapshot(jsonb, date, text) to authenticated;
