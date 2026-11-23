-- 患者様ごとの「提案中」（適用済み）
-- proposal_menus：null＝提案していない、配列＝提案中（提案しているメニュー）。proposal_note：提案の内容・反応。proposal_at：提案を始めた日時
alter table public.patient_marks add column if not exists proposal_menus text[];
alter table public.patient_marks add column if not exists proposal_note text;
alter table public.patient_marks add column if not exists proposal_at timestamptz;
