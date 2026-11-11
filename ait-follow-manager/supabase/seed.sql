-- =============================================================================
-- ローカル開発用シードデータ（すべて架空のデータです。実在の顧客情報は使用しないこと）
-- ログイン：下記メールアドレス ＋ パスワード DemoPass1234
-- =============================================================================

-- 架空ユーザー（ローカル Supabase Auth 用）
create or replace function pg_temp.demo_user(p_id uuid, p_email text, p_name text) returns void
language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('DemoPass1234', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', p_name), now(), now(),
    '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
end $$;

select pg_temp.demo_user('00000000-0000-4000-a000-000000000001', 'platform@example.com', '運営 管理者');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000002', 'admin@example.com', '組織 管理者');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000003', 'manager@example.com', '本店 店長');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000004', 'staff@example.com', '本店 スタッフ');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000005', 'staff2@example.com', '駅前 スタッフ');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000006', 'other-admin@example.com', '他社 管理者');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a000-000000000001');

-- 組織・店舗
insert into public.organizations (id, name, slug) values
  ('00000000-0000-4000-b000-000000000001', 'デモ整骨院グループ', 'demo'),
  ('00000000-0000-4000-b000-000000000002', 'サンプルサロン', 'sample-salon');
select app.seed_organization_defaults('00000000-0000-4000-b000-000000000001');
select app.seed_organization_defaults('00000000-0000-4000-b000-000000000002');

insert into public.stores (id, organization_id, name, code) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-b000-000000000001', '本店', 'HQ'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-b000-000000000001', '駅前店', 'EKI'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-b000-000000000002', 'サロン本店', 'MAIN');

insert into public.memberships (user_id, organization_id, store_id, role) values
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000001', null, 'org_admin'),
  ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-8000-000000000001', 'store_manager'),
  ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-8000-000000000001', 'staff'),
  ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-8000-000000000002', 'staff'),
  ('00000000-0000-4000-a000-000000000006', '00000000-0000-4000-b000-000000000002', null, 'org_admin');

insert into public.tags (organization_id, name, color) values
  ('00000000-0000-4000-b000-000000000001', '新規', 'blue'),
  ('00000000-0000-4000-b000-000000000001', '回数券', 'green'),
  ('00000000-0000-4000-b000-000000000001', '要注意', 'amber');

-- 架空顧客（電話番号は 090-0000-xxxx、メールは example.com）
with names(i, fam, giv, fam_k, giv_k) as (
  values
  (1, '青空', '一郎', 'あおぞら', 'いちろう'), (2, '若葉', '花子', 'わかば', 'はなこ'),
  (3, '山並', '次郎', 'やまなみ', 'じろう'),   (4, '川辺', '桜', 'かわべ', 'さくら'),
  (5, '森野', '健', 'もりの', 'けん'),         (6, '星野', '美咲', 'ほしの', 'みさき'),
  (7, '月見', '大輔', 'つきみ', 'だいすけ'),   (8, '風間', '彩', 'かざま', 'あや'),
  (9, '雪村', '翔', 'ゆきむら', 'しょう'),     (10, '海野', '結衣', 'うみの', 'ゆい'),
  (11, '空知', '悠', 'そらち', 'ゆう'),        (12, '花園', '舞', 'はなぞの', 'まい'),
  (13, '石田', '蓮', 'いしだ', 'れん'),        (14, '野原', '葵', 'のはら', 'あおい'),
  (15, '港', '陽太', 'みなと', 'ようた'),      (16, '丘', '凛', 'おか', 'りん'),
  (17, '泉', '湊', 'いずみ', 'みなと'),        (18, '岬', '紬', 'みさき', 'つむぎ'),
  (19, '虹川', '樹', 'にじかわ', 'いつき'),    (20, '光田', '芽依', 'みつだ', 'めい')
)
insert into public.customers (organization_id, store_id, customer_code, family_name, given_name,
  family_name_kana, given_name_kana, phone, email, assigned_staff_id)
select '00000000-0000-4000-b000-000000000001',
       case when i % 4 = 0 then '00000000-0000-4000-8000-000000000002'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end,
       'D' || lpad(i::text, 4, '0'), fam, giv, fam_k, giv_k,
       '090-0000-' || lpad(i::text, 4, '0'),
       'customer' || i || '@example.com',
       case when i % 4 = 0 then '00000000-0000-4000-a000-000000000005'::uuid
            when i % 2 = 0 then '00000000-0000-4000-a000-000000000004'::uuid
            else '00000000-0000-4000-a000-000000000003'::uuid end
from names;

-- 他組織の架空顧客（テナント分離の確認用）
insert into public.customers (organization_id, store_id, customer_code, family_name, given_name, phone)
values ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-8000-000000000003', 'S0001', '他社', '顧客', '090-0000-9999');

-- 来店履歴（今日からの相対日付）
insert into public.visits (organization_id, store_id, customer_id, visited_on, menu_label)
select c.organization_id, c.store_id, c.id, current_date - d, '標準コース'
from public.customers c
cross join lateral (
  select unnest(case (substring(c.customer_code from 2)::int % 6)
    when 0 then array[1]            -- 昨日が初回来店
    when 1 then array[30, 7]        -- 7日前に来店
    when 2 then array[120, 62]      -- 62日前が最終来店
    when 3 then array[3]            -- 3日前が初回、予約なし
    when 4 then array[40, 20, 10]
    else array[200, 5]
  end) d
) v
where c.organization_id = '00000000-0000-4000-b000-000000000001';

-- 一部の顧客に将来の予約
insert into public.appointments (organization_id, store_id, customer_id, scheduled_at, status)
select organization_id, store_id, id, (current_date + 5)::timestamp + time '10:00', 'scheduled'
from public.customers
where organization_id = '00000000-0000-4000-b000-000000000001' and customer_code in ('D0004', 'D0010', 'D0016');

-- 連絡同意（多くは同意あり、一部は配信停止・連絡不可・未確認のまま）
insert into public.consent_records (organization_id, customer_id, channel, status, source)
select organization_id, id, 'all',
       case when customer_code = 'D0005' then 'unsubscribed'
            when customer_code = 'D0011' then 'not_allowed'
            else 'granted' end,
       'in_store_form'
from public.customers
where organization_id = '00000000-0000-4000-b000-000000000001' and customer_code not in ('D0019', 'D0020');

-- タグ付け
insert into public.customer_tags (organization_id, customer_id, tag_id)
select c.organization_id, c.id, t.id
from public.customers c join public.tags t on t.organization_id = c.organization_id and t.name = '新規'
where c.first_visit_on >= current_date - 3;
