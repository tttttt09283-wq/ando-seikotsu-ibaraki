-- 初期データ：あんど整骨院グループ 全7院
-- 院コードは後から画面で変更できない（帳票・連携のキー）ため、必要なら本番投入前に調整する。
insert into public.clinics (clinic_code, name, display_order) values
  ('HIRAKATA',    '枚方本院', 10),
  ('TAGUCHIYAMA', '田口山院', 20),
  ('TSUDA',       '津田院',   30),
  ('KATANO',      '交野院',   40),
  ('IBARAKI',     '茨木院',   50),
  ('OWADA',       '大和田院', 60),
  ('KORIEN',      '香里園院', 70)
on conflict (clinic_code) do nothing;
