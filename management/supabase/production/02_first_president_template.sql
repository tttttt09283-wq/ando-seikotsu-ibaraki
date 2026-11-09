-- 本番：最初の社長を登録する（ひな形。実際の値は承認後に、社長本人に確認して入れる。リポジトリには実データを書かない）
-- 社長は POS ですでにログインしているので、POS の Supabase Auth のユーザー（<ログインID>@ando.jp）に新システムのプロフィールを紐づける
-- 以降のスタッフの登録・ID/PASSの発行・CSV取り込みは、社長が新システムの画面（/admin/users・/admin/import）で行う
begin;
insert into mgmt.users (id, staff_code, login_id, name, employment_type, hire_date, pos_staff_id, must_change_password)
select u.id, '<スタッフID>', '<ログインID>', '<氏名>', '役員', null, <POSのスタッフ番号 または null>, false
from auth.users u where u.email = '<ログインID>@ando.jp';
insert into mgmt.user_roles (user_id, role_id, starts_on)
select m.id, r.id, current_date from mgmt.users m, mgmt.roles r where m.login_id = '<ログインID>' and r.code = 'PRESIDENT';
-- 1行ずつ入ったことを確かめてから commit する
select m.login_id, m.name, r.code from mgmt.users m join mgmt.user_roles ur on ur.user_id = m.id join mgmt.roles r on r.id = ur.role_id;
commit;
