-- 初期マスタ：役職・権限・役職×権限・7院（本番にも入れるマスタ。人のデータは含まない）
-- 権限の表は docs/permissions.md §3。指示書に記載がなく「未確定」の権限は付けていない

insert into mgmt.roles (code, name, scope, rank) values
  ('PRESIDENT', '社長', 'global', 1),
  ('GM', 'GM', 'global', 2),
  ('BM', 'BM', 'area', 3),
  ('MANAGER', '院長', 'store', 4),
  ('STAFF', '一般スタッフ', 'store', 5),
  ('PART_TIMER', 'アルバイト', 'store', 6)
on conflict (code) do update set name = excluded.name, scope = excluded.scope, rank = excluded.rank;

insert into mgmt.permissions (code, description) values
  ('leave.view.self', '自分の残数・履歴を見る'),
  ('leave.view.store', '店舗スタッフの残数・申請を見る'),
  ('leave.request.self', '自分の休暇を申請する'),
  ('leave.request.proxy', '店舗スタッフの休暇を代理で申請する'),
  ('leave.paid.final_approve', '有給の最終承認'),
  ('leave.shift.approve', '振休の承認（店舗）'),
  ('leave.adjust', '残数の修正'),
  ('leave.import', 'CSVでの残数取り込み'),
  ('parttime.request', 'アルバイト勤務の申請'),
  ('parttime.final_approve', 'アルバイト勤務の最終承認'),
  ('holidaychange.request', '振休→アルバイト勤務の変更申請'),
  ('holidaychange.gm_review', '振休変更の事前確認'),
  ('holidaychange.final_approve', '振休変更の最終承認'),
  ('meeting.manage', '会議・議事録の作成・提出'),
  ('task.manage.store', '店舗のタスク管理'),
  ('task.view.self', '自分のタスクを見る'),
  ('rule.view', '規定を読む・確認する'),
  ('rule.edit', '規定の改定案を作る'),
  ('rule.approve', '規定の承認・公開'),
  ('dashboard.president', '社長ダッシュボード'),
  ('dashboard.gm', 'GMダッシュボード'),
  ('dashboard.area', 'エリアダッシュボード'),
  ('dashboard.manager', '院長ダッシュボード'),
  ('audit.view', '承認履歴・監査ログを見る'),
  ('master.manage', '店舗・ユーザー・所属・役職・ID/PASSの管理'),
  ('staff.view.store', '店舗のスタッフ情報を見る'),
  ('staff.view.all', '全社の役職者を見る')
on conflict (code) do update set description = excluded.description;

-- 役職×権限（docs/permissions.md §3）
with m(role_code, perm) as (values
  -- 社長
  ('PRESIDENT','leave.view.self'),('PRESIDENT','leave.view.store'),('PRESIDENT','leave.paid.final_approve'),
  ('PRESIDENT','leave.adjust'),('PRESIDENT','leave.import'),('PRESIDENT','parttime.final_approve'),
  ('PRESIDENT','holidaychange.final_approve'),('PRESIDENT','meeting.manage'),('PRESIDENT','task.manage.store'),
  ('PRESIDENT','task.view.self'),('PRESIDENT','rule.view'),('PRESIDENT','rule.edit'),('PRESIDENT','rule.approve'),
  ('PRESIDENT','dashboard.president'),('PRESIDENT','dashboard.gm'),('PRESIDENT','audit.view'),('PRESIDENT','master.manage'),
  ('PRESIDENT','staff.view.store'),('PRESIDENT','staff.view.all'),
  -- GM
  ('GM','leave.view.self'),('GM','leave.view.store'),('GM','leave.request.self'),('GM','holidaychange.gm_review'),
  ('GM','meeting.manage'),('GM','task.manage.store'),('GM','task.view.self'),('GM','rule.view'),
  ('GM','dashboard.gm'),('GM','audit.view'),('GM','staff.view.store'),('GM','staff.view.all'),
  -- BM（担当エリアの店舗で効く）
  ('BM','leave.view.self'),('BM','leave.view.store'),('BM','leave.request.self'),('BM','task.view.self'),
  ('BM','rule.view'),('BM','dashboard.area'),('BM','staff.view.store'),
  -- 院長（所属店舗で効く）
  ('MANAGER','leave.view.self'),('MANAGER','leave.view.store'),('MANAGER','leave.request.self'),('MANAGER','leave.request.proxy'),
  ('MANAGER','leave.shift.approve'),('MANAGER','parttime.request'),('MANAGER','holidaychange.request'),
  ('MANAGER','meeting.manage'),('MANAGER','task.manage.store'),('MANAGER','task.view.self'),('MANAGER','rule.view'),
  ('MANAGER','dashboard.manager'),('MANAGER','staff.view.store'),
  -- 一般スタッフ
  ('STAFF','leave.view.self'),('STAFF','leave.request.self'),('STAFF','task.view.self'),('STAFF','rule.view'),
  -- アルバイト（休暇の申請可否は Q-10 で未確定のため付けない）
  ('PART_TIMER','leave.view.self'),('PART_TIMER','task.view.self'),('PART_TIMER','rule.view')
)
insert into mgmt.role_permissions (role_id, permission_id)
select r.id, p.id from m join mgmt.roles r on r.code = m.role_code join mgmt.permissions p on p.code = m.perm
on conflict do nothing;

-- 7院（指示書 §2）。POSとの紐づけ（pos_store_id）は本番適用時に確認して設定する
insert into mgmt.stores (code, name, display_order) values
  ('HIRAKATA', '枚方本院', 1),
  ('TAGUCHIYAMA', '田口山分院', 2),
  ('TSUDA', '津田院', 3),
  ('KATANO', '交野院', 4),
  ('IBARAKI', '茨木院', 5),
  ('OWADA', '大和田院', 6),
  ('KORIEN', '香里園院', 7)
on conflict (code) do nothing;
