-- 本番：新システムの7院と、POS の店舗表（public.stores）を紐づける
-- 2026-11-09 時点の本番の POS：1＝あんど整骨院 香里園駅前院、2＝あんど整骨院 茨木院（POS では休止中）
-- 適用前に「select id, name, active from public.stores」で番号と院名が合っていることを必ず確かめる
update mgmt.stores set pos_store_id = 1 where code = 'KORIEN';
update mgmt.stores set pos_store_id = 2 where code = 'IBARAKI';
select code, name, pos_store_id from mgmt.stores order by display_order;
