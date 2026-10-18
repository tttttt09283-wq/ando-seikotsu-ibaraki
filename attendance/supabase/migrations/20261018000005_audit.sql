-- 0005: 監査ログ（追記専用）

create type public.audit_actor_kind as enum ('user', 'kiosk', 'system');

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_user_id uuid,
  actor_kind    public.audit_actor_kind not null,
  action        text not null,
  table_name    text not null,
  record_id     text,
  before        jsonb,
  after         jsonb,
  reason        text,
  -- 過去日付の付与・修正などを明示する（後続フェーズの台帳で使用）
  is_backdated  boolean not null default false
);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);

create trigger audit_logs_forbid_update
  before update or delete on public.audit_logs
  for each row execute function app.forbid_mutation();
create trigger audit_logs_forbid_truncate
  before truncate on public.audit_logs
  for each statement execute function app.forbid_mutation();

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (app.is_hq());

-- 汎用の行変更監査トリガー。第1引数に主キー列名を渡す。
-- 理由はトランザクション内で `select set_config('app.change_reason', '...', true)` により渡せる。
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pk_column text := tg_argv[0];
  before_row jsonb;
  after_row jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    before_row := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    after_row := to_jsonb(new);
  end if;
  if tg_op = 'UPDATE' and before_row - 'updated_at' = after_row - 'updated_at' then
    return new; -- 実質的な変更なし
  end if;

  insert into public.audit_logs (actor_user_id, actor_kind, action, table_name, record_id, before, after, reason)
  values (
    auth.uid(),
    case when auth.uid() is null then 'system' else 'user' end::public.audit_actor_kind,
    lower(tg_op),
    tg_table_name,
    coalesce(after_row, before_row) ->> pk_column,
    before_row,
    after_row,
    nullif(current_setting('app.change_reason', true), '')
  );
  return coalesce(new, old);
end;
$$;

revoke all on function app.audit_row_change() from public;

create trigger clinics_audit after insert or update on public.clinics
  for each row execute function app.audit_row_change('clinic_id');
create trigger staff_profiles_audit after insert or update on public.staff_profiles
  for each row execute function app.audit_row_change('staff_id');
create trigger staff_private_details_audit after insert or update on public.staff_private_details
  for each row execute function app.audit_row_change('staff_id');
create trigger staff_clinic_assignments_audit after insert or update on public.staff_clinic_assignments
  for each row execute function app.audit_row_change('assignment_id');
create trigger employment_contracts_audit after insert or update on public.employment_contracts
  for each row execute function app.audit_row_change('contract_id');
create trigger app_accounts_audit after insert or update on public.app_accounts
  for each row execute function app.audit_row_change('user_id');
create trigger user_roles_audit after insert or update on public.user_roles
  for each row execute function app.audit_row_change('id');
