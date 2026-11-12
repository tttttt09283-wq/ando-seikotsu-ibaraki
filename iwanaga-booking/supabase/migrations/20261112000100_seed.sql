-- =====================================================================
-- 初期データ
--   * 3拠点とも受付は無効（booking_enabled = false）で登録する
--     - 自宅院：開業許可・準備完了（opening_ready）まで受付不可
--     - 勤務先：会社の正式承認（company_approved）まで受付不可
--   * 自宅院のメニューは「税込の提案価格」として非公開で登録（管理者の公開承認で公開）
--   * 勤務先のメニュー・料金は登録しない（会社承認済みの設定を管理画面から登録する）
-- =====================================================================

insert into public.locations (
  id, controller, kind, name, short_name, public_area, private_address,
  buffer_minutes, travel_minutes, booking_deadline_hours, max_advance_days, daily_limit, slot_interval_minutes,
  controller_name, privacy_purpose, privacy_access, cancel_policy, precautions, contact_info, sort_order
) values
(
  'home', 'iwanaga_private', 'home', '岩永拓己 プライベート鍼灸院', '自宅鍼灸院',
  '詳しい所在地は、ご予約確定後にご本人にのみご案内します', null,
  15, 60, 24, 60, 4, 30,
  '岩永拓己（個人）',
  'ご予約の受付・内容確認・日時の調整・確定/変更/キャンセルのご連絡、当日のご案内のためにのみ利用します。勤務先（あんど整骨院）を含む他の事業への提供・転用や、広告配信への利用はいたしません。',
  '閲覧・管理できるのは岩永拓己本人のみです。お名前・電話番号・ご相談内容・LINEのユーザー識別子は暗号化して保存し、ご相談内容は施術完了・キャンセル後90日、その他の情報は最後のご予約から3年で削除します。削除のご希望は公式LINEでお申し出ください。',
  'ご予約の変更・キャンセルは、ご予約日の前日までに公式LINEでご連絡ください。',
  '体調がすぐれない日は無理をせずご連絡ください。施術の前後は飲酒をお控えください。動きやすい服装でお越しください。',
  '公式LINE（岩永拓己）のトークでご連絡ください。', 1
),
(
  'ibaraki', 'enejoy_hand', 'workplace', 'あんど整骨院 茨木院', '茨木院',
  '大阪府茨木市', null,
  10, 60, 24, 60, 0, 30,
  'あんど整骨院（運営会社）',
  'あんど整骨院 茨木院でのご予約の受付・確認・ご連絡のためにのみ利用します。岩永拓己の自宅鍼灸院など他の事業への転用や、広告配信への利用はいたしません。',
  '閲覧・管理できるのは、会社が認めた範囲の担当者のみです。',
  '', '', '公式LINE（岩永拓己）のトークでご連絡ください。', 2
),
(
  'korien', 'enejoy_hand', 'workplace', 'あんど整骨院 香里園院', '香里園院',
  '大阪府寝屋川市（香里園）', null,
  10, 60, 24, 60, 0, 30,
  'あんど整骨院（運営会社）',
  'あんど整骨院 香里園院でのご予約の受付・確認・ご連絡のためにのみ利用します。岩永拓己の自宅鍼灸院など他の事業への転用や、広告配信への利用はいたしません。',
  '閲覧・管理できるのは、会社が認めた範囲の担当者のみです。',
  '', '', '公式LINE（岩永拓己）のトークでご連絡ください。', 3
);

-- 自宅院の初期メニュー（税込の提案価格・非公開）
insert into public.services (location_id, controller, name, description, duration_minutes, price_tax_included, price_status, is_published, sort_order) values
  ('home', 'iwanaga_private', '初回', 'カウンセリングと全身の鍼灸施術', 90, 12000, 'proposed', false, 1),
  ('home', 'iwanaga_private', '通常', '2回目以降の鍼灸施術', 60, 10000, 'proposed', false, 2),
  ('home', 'iwanaga_private', '集中', '時間をかけて丁寧に行う鍼灸施術', 90, 15000, 'proposed', false, 3);

-- 自宅院の営業時間の例（受付開始前に管理画面で見直してください）
insert into public.availability_rules (location_id, weekday, start_time, end_time) values
  ('home', 1, '10:00', '19:00'), ('home', 2, '10:00', '19:00'), ('home', 3, '10:00', '19:00'),
  ('home', 4, '10:00', '19:00'), ('home', 5, '10:00', '19:00'), ('home', 6, '10:00', '17:00');
