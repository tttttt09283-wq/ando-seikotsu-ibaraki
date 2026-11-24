-- カラダ年齢チェック：URLを開いた回数（匿名）
-- チェックのページ（/check。/age・/qr・/th・/ig から来た場合も）と、シェアされたページ（/s）を開くたびに1行。
-- 送るのは 端末ごとの匿名ID・どのページか・どこから開いたか・LINEの中か だけ。個人情報は入れない。
-- 書き込みは record_body_check_view() からだけ。読めるのは院のスタッフだけ。

create table if not exists public.body_check_views (
  id         bigserial primary key,
  viewed_at  timestamptz not null default now(),
  visitor_id text not null,
  page       text not null check (page in ('check', 'share')),
  source     text,
  in_line    boolean not null default false
);
create index if not exists body_check_views_viewed_at on public.body_check_views (viewed_at);

alter table public.body_check_views enable row level security;
drop policy if exists body_check_views_staff_select on public.body_check_views;
create policy body_check_views_staff_select on public.body_check_views for select to authenticated using (public.is_staff());
revoke all on public.body_check_views from anon;
revoke insert, update, delete, truncate on public.body_check_views from authenticated;
grant select on public.body_check_views to authenticated;

create or replace function public.record_body_check_view(p jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  vid text := p->>'visitor_id';
  pg text := p->>'page';
begin
  if vid is null or vid !~ '^[A-Za-z0-9-]{8,64}$' then return false; end if;
  if pg not in ('check', 'share') then return false; end if;
  -- 読み込み直し・二重送信は数えない（同じ端末・同じページを10秒以内）
  if exists (select 1 from body_check_views where visitor_id = vid and page = pg and viewed_at > now() - interval '10 seconds') then
    return true;
  end if;
  insert into body_check_views (visitor_id, page, source, in_line)
  values (vid, pg,
          left(nullif(regexp_replace(coalesce(p->>'source', ''), '[^a-z0-9_-]', '', 'g'), ''), 20),
          coalesce((p->>'in_line')::boolean, false));
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.record_body_check_view(jsonb) from public;
grant execute on function public.record_body_check_view(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
