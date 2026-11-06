// PHASE 3：休暇残数・年5日・CSV取り込みのテスト（ローカルの PostgreSQL で実行）
// 対応する検証項目：T-07（残数）・T-09（期限・繰越）・T-14（振休の期限）・T-15（振替と祝振替）・年5日・移行
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, as } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org, type;
const q = (sql, p) => db.client.query(sql, p);
before(async () => {
  db = await startDb();
  org = await buildOrg(q);
  type = Object.fromEntries((await q("select code, id from mgmt.leave_types")).rows.map((r) => [r.code, r.id]));
});
after(async () => { if (db) await db.stop(); });

const n = (v) => Number(v);
const president = (fn) => as(db.client, org.u.president, fn);
// 付与は社長の RPC で作る（テストのために永続化：as() はロールバックするので、作成は superuser で行う）
async function grant(userKey, code, grantDate, days, extra = {}) {
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: org.u.president })]);
  const r = await q(
    "select mgmt.add_leave_grant($1,$2,$3,$4,$5,$6,null,$7) id",
    [org.u[userKey], code, grantDate, days, extra.source ?? (code === "PAID" ? "statutory" : "shift_earned"), extra.origin ?? (code.startsWith("SHIFT") ? grantDate : null), extra.prior ?? 0]);
  await q("select set_config('request.jwt.claims', '', false)");
  return r.rows[0].id;
}
async function use(userKey, code, grantId, date, days, status, extra = {}) {
  await q("insert into mgmt.leave_usage (leave_grant_id, user_id, leave_type_id, usage_date, days, status, counts_toward_5day) values ($1,$2,$3,$4,$5,$6,$7)",
    [grantId, org.u[userKey], type[code], date, days, status, extra.counts ?? true]);
}
const balance = (viewerKey, userKey, code, asOf) =>
  as(db.client, org.u[viewerKey], async (x) => (await x("select mgmt.leave_balance($1,$2,$3) b", [org.u[userKey], code, asOf])).rows[0].b);

test("有効期限：有給は付与日から2年後の前日、振休は出勤した月の末日（うるう年も）", async () => {
  const r = (await q(`select mgmt.expiry_for($1,'2026-04-01') paid, mgmt.expiry_for($2,'2026-11-23') shift, mgmt.expiry_for($2,'2028-02-10') leap, mgmt.expiry_for($3,'2026-12-31') hol`,
    [type.PAID, type.SHIFT, type.SHIFT_HOLIDAY])).rows[0];
  const d = (v) => v.toISOString().slice(0, 10);
  // pg は date を Date に変換するため、ローカル時刻のずれが出ないよう文字列で比較
  const s = (await q(`select mgmt.expiry_for($1,'2026-04-01')::text paid, mgmt.expiry_for($2,'2026-11-23')::text shift, mgmt.expiry_for($2,'2028-02-10')::text leap, mgmt.expiry_for($3,'2026-12-31')::text hol`,
    [type.PAID, type.SHIFT, type.SHIFT_HOLIDAY])).rows[0];
  assert.ok(r && d);
  assert.deepEqual(s, { paid: "2028-03-31", shift: "2026-11-30", leap: "2028-02-29", hol: "2026-12-31" });
});

test("T-07：付与・取得済み・予定・調整から残数を計算する", async () => {
  const g = await grant("staff_IBARAKI", "PAID", "2026-04-01", 10);
  await use("staff_IBARAKI", "PAID", g, "2026-05-01", 1, "taken");
  await use("staff_IBARAKI", "PAID", g, "2026-06-01", 1, "taken");
  await use("staff_IBARAKI", "PAID", g, "2026-12-01", 1, "planned");
  await use("staff_IBARAKI", "PAID", g, "2026-07-01", 1, "cancelled");
  const b = await balance("staff_IBARAKI", "staff_IBARAKI", "PAID", "2026-11-06");
  assert.deepEqual([n(b.granted), n(b.taken), n(b.planned), n(b.current), n(b.after_planned)], [10, 2, 1, 8, 7]);
  assert.equal(b.next_expiry_date, "2028-03-31");
  // 調整（理由必須・社長のみ）
  await president((x) => x("select mgmt.adjust_leave($1, 0.5, '移行時の端数を補正')", [g]));
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: org.u.president })]);
  await q("select mgmt.adjust_leave($1, 0.5, '移行時の端数を補正')", [g]);
  await q("select set_config('request.jwt.claims', '', false)");
  const b2 = await balance("staff_IBARAKI", "staff_IBARAKI", "PAID", "2026-11-06");
  assert.deepEqual([n(b2.adjusted), n(b2.current), n(b2.after_planned)], [0.5, 8.5, 7.5]);
  await assert.rejects(president((x) => x("select mgmt.adjust_leave($1, 1, '')", [g])), /修正理由/);
  await assert.rejects(president((x) => x("select mgmt.adjust_leave($1, -9, 'テスト')", [g])), /マイナス/);
  for (const key of ["gm", "mgr_IBARAKI", "staff_IBARAKI"]) {
    await assert.rejects(as(db.client, org.u[key], (x) => x("select mgmt.adjust_leave($1, 1, '勝手な修正')", [g])), /権限がありません/, key);
  }
  // 修正の記録は変更・削除できない
  await assert.rejects(q("update mgmt.leave_adjustments set delta_days = 5"), /変更・削除できません/);
});

test("T-09：期限の早い付与（繰越分）が先、期限の翌日に失効として記録", async () => {
  const old = await grant("staff_OWADA", "PAID", "2024-10-01", 11);      // 期限 2026-09-30
  const cur = await grant("staff_OWADA", "PAID", "2025-10-01", 12);      // 期限 2027-09-30
  await use("staff_OWADA", "PAID", old, "2025-01-10", 1, "taken");
  // 期限当日：まだ使える
  let b = await balance("president", "staff_OWADA", "PAID", "2026-09-30");
  assert.deepEqual([n(b.granted), n(b.taken), n(b.current), n(b.lapsed)], [23, 1, 22, 0]);
  assert.equal(b.next_expiry_date, "2026-09-30");
  assert.equal(n(b.next_expiry_days), 10);
  // 期限の翌日：前年分の残り10日は失効、現在残数は今年分だけ
  b = await balance("president", "staff_OWADA", "PAID", "2026-10-01");
  assert.deepEqual([n(b.granted), n(b.current), n(b.lapsed)], [12, 12, 10]);
  assert.equal(b.grants.find((x) => x.grant_id === old).state, "expired_lapsed");
  assert.equal(b.grants.find((x) => x.grant_id === cur).state, "active");
});

test("T-14・T-15：振休は振替（公休出勤）と祝振替（祝日出勤）を分け、月末を過ぎても消さずにアラート", async () => {
  await grant("staff_KORIEN", "SHIFT_HOLIDAY", "2026-11-23", 1);   // 勤労感謝の日に出勤
  await grant("staff_KORIEN", "SHIFT", "2026-11-08", 1);           // 公休日に出勤
  let h = await balance("mgr_KORIEN", "staff_KORIEN", "SHIFT_HOLIDAY", "2026-11-30");
  assert.deepEqual([n(h.current), n(h.overdue), h.next_expiry_date], [1, 0, "2026-11-30"]);
  h = await balance("mgr_KORIEN", "staff_KORIEN", "SHIFT_HOLIDAY", "2026-12-01");
  assert.deepEqual([n(h.current), n(h.overdue), h.overdue_since, n(h.lapsed)], [1, 1, "2026-11-30", 0]);
  const s = await balance("mgr_KORIEN", "staff_KORIEN", "SHIFT", "2026-12-01");
  assert.deepEqual([n(s.current), n(s.overdue)], [1, 1]);
  // 期限切れ一覧：香里園院の院長には出る、ほかの院の院長には出ない
  const listFor = (key) => as(db.client, org.u[key], async (x) => (await x("select user_id, type_code, days::float from mgmt.overdue_shift_holidays('2026-12-01') order by type_code")).rows);
  assert.deepEqual((await listFor("mgr_KORIEN")).map((r) => [r.user_id === org.u.staff_KORIEN, r.type_code, r.days]), [[true, "SHIFT", 1], [true, "SHIFT_HOLIDAY", 1]]);
  assert.deepEqual(await listFor("mgr_TSUDA"), []);
  // 振休は出勤日が必須
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: org.u.president })]);
  await assert.rejects(q("select mgmt.add_leave_grant($1,'SHIFT','2026-11-01',1,'shift_earned',null)", [org.u.staff_KORIEN]), /出勤した日/);
  await q("select set_config('request.jwt.claims', '', false)");
});

test("見る権限：本人・自院の院長・BM（担当エリア）・社長・GM。他院の院長は見られない", async () => {
  await grant("staff_TSUDA", "PAID", "2026-04-01", 10);
  for (const key of ["staff_TSUDA", "mgr_TSUDA", "president", "gm"]) {
    const b = await balance(key, "staff_TSUDA", "PAID", "2026-11-06");
    assert.equal(n(b.current), 10, key);
  }
  for (const key of ["mgr_IBARAKI", "staff_IBARAKI", "bmSouth"]) {
    await assert.rejects(balance(key, "staff_TSUDA", "PAID", "2026-11-06"), /権限がありません/, key);
    const rows = await as(db.client, org.u[key], async (x) => (await x("select count(*)::int c from mgmt.leave_grants where user_id = $1", [org.u.staff_TSUDA])).rows[0].c);
    assert.equal(rows, 0, key);
    const st = await as(db.client, org.u[key], async (x) => (await x("select count(*)::int c from mgmt.leave_grant_state($1, $2)", [org.u.staff_TSUDA, type.PAID])).rows[0].c);
    assert.equal(st, 0, `${key}：付与ごとの状態も見えない`);
  }
  // 南エリアのBMは茨木院（南）のスタッフを見られる
  const ib = await balance("bmSouth", "staff_IBARAKI", "PAID", "2026-11-06");
  assert.equal(typeof ib.current, "number");
  // テーブルへの直接書き込みはできない（承認RPCを通す）
  await assert.rejects(as(db.client, org.u.president, (x) => x("insert into mgmt.leave_usage (leave_grant_id, user_id, leave_type_id, usage_date, days, status) select id, user_id, leave_type_id, '2026-12-24', 1, 'planned' from mgmt.leave_grants limit 1")), /permission denied/);
  await assert.rejects(as(db.client, org.u.president, (x) => x("update mgmt.leave_grants set days = 99")), /permission denied/);
});

test("年5日：10日以上の付与が対象。半日は0.5日、時間単位は算入しない、移行前の取得を足す、期限が近いほど強い警告", async () => {
  const g = await grant("staff_HIRAKATA", "PAID", "2026-04-01", 10, { prior: 1 });
  await use("staff_HIRAKATA", "PAID", g, "2026-05-01", 1, "taken");
  await use("staff_HIRAKATA", "PAID", g, "2026-06-01", 0.5, "taken");
  await use("staff_HIRAKATA", "PAID", g, "2026-06-15", 0.5, "taken");
  await use("staff_HIRAKATA", "PAID", g, "2026-07-01", 1, "taken", { counts: false });   // 時間単位（8時間）
  const st = (asOf) => as(db.client, org.u.mgr_HIRAKATA, async (x) => (await x("select mgmt.five_day_status($1, $2) s", [org.u.staff_HIRAKATA, asOf])).rows[0].s);
  let s = await st("2026-11-06");
  assert.deepEqual([s.target, s.period_start, s.period_end, n(s.taken), n(s.remaining_required), s.level], [true, "2026-04-01", "2027-03-31", 3, 2, "caution"]);
  s = await st("2027-01-15");
  assert.equal(s.level, "warning");
  s = await st("2027-03-10");
  assert.equal(s.level, "urgent");
  // 承認済みの予定で5日に届く見込みなら planned_ok
  await use("staff_HIRAKATA", "PAID", g, "2027-03-20", 1, "planned");
  await use("staff_HIRAKATA", "PAID", g, "2027-03-21", 1, "planned");
  s = await st("2027-03-10");
  assert.deepEqual([n(s.planned), s.level], [2, "planned_ok"]);
  // 9日の付与（比例付与など）は対象外
  await grant("staff_TAGUCHIYAMA", "PAID", "2026-04-01", 9);
  const t = await as(db.client, org.u.president, async (x) => (await x("select mgmt.five_day_status($1,'2026-11-06') s", [org.u.staff_TAGUCHIYAMA])).rows[0].s);
  assert.equal(t.target, false);
});

test("CSV取り込み：エラーがあると取り込めない／取り込み・二重実行の防止・取り消し", async () => {
  const mkBatch = async (rows, errors = 0) => {
    const b = (await q("insert into mgmt.import_batches (kind, file_name, row_count, error_count, created_by) values ('leave_balance','残数.csv',$1,$2,$3) returning id", [rows.length, errors, org.u.president])).rows[0].id;
    for (const [i, r] of rows.entries()) await q("insert into mgmt.import_rows (batch_id, row_no, data, errors) values ($1,$2,$3,$4)", [b, i + 2, r.data, JSON.stringify(r.errors ?? [])]);
    return b;
  };
  const code = (key) => q("select staff_code from mgmt.users where id = $1", [org.u[key]]).then((r) => r.rows[0].staff_code);
  const ok = await mkBatch([
    { data: { staff_code: await code("staff_KATANO"), type_code: "PAID", grant_date: "2026-10-01", expires_on: "2028-09-30", remaining: 7.5, counts_toward_5day: true, prior_taken: 2 } },
    { data: { staff_code: await code("staff_KATANO"), type_code: "PAID", grant_date: "2025-10-01", expires_on: "2027-09-30", remaining: 0 } },
    { data: { staff_code: await code("staff_KATANO"), type_code: "SHIFT", grant_date: "2026-11-02", expires_on: "2026-11-30", remaining: 1 } },
  ]);
  const bad = await mkBatch([{ data: { staff_code: "X", type_code: "PAID" }, errors: ["スタッフIDが見つかりません"] }], 1);
  await assert.rejects(president((x) => x("select mgmt.import_commit($1)", [bad])), /エラーのある行/);
  await assert.rejects(as(db.client, org.u.gm, (x) => x("select mgmt.import_commit($1)", [ok])), /権限がありません/);

  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: org.u.president })]);
  assert.equal((await q("select mgmt.import_commit($1) n", [ok])).rows[0].n, 2, "残数0の行は付与を作らない");
  await assert.rejects(q("select mgmt.import_commit($1)", [ok]), /すでに実行済み/);
  await q("select set_config('request.jwt.claims', '', false)");

  let b = await balance("staff_KATANO", "staff_KATANO", "PAID", "2026-11-06");
  assert.equal(n(b.current), 7.5);
  assert.equal(b.grants[0].source, "migration");
  const fd = await as(db.client, org.u.staff_KATANO, async (x) => (await x("select mgmt.five_day_status($1,'2026-11-06') s", [org.u.staff_KATANO])).rows[0].s);
  assert.equal(n(fd.taken), 2, "移行前の取得済み日数が年5日に入る");

  // 取り消し：理由必須。取得があった付与があれば取り消せない
  await assert.rejects(president((x) => x("select mgmt.import_rollback($1,'')", [ok])), /理由/);
  const g = (await q("select id from mgmt.leave_grants where import_batch_id = $1 and leave_type_id = $2", [ok, type.SHIFT])).rows[0].id;
  await use("staff_KATANO", "SHIFT", g, "2026-11-20", 1, "planned");
  await assert.rejects(president((x) => x("select mgmt.import_rollback($1,'取り込み間違い')", [ok])), /取り消せません/);
  await q("update mgmt.leave_usage set status = 'cancelled' where leave_grant_id = $1", [g]);
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: org.u.president })]);
  assert.equal((await q("select mgmt.import_rollback($1,'取り込み間違い') n", [ok])).rows[0].n, 2);
  await q("select set_config('request.jwt.claims', '', false)");
  b = await balance("staff_KATANO", "staff_KATANO", "PAID", "2026-11-06");
  assert.equal(n(b.current), 0);
  assert.equal((await q("select status from mgmt.import_batches where id = $1", [ok])).rows[0].status, "rolled_back");
});

test("院ごとの残数一覧：院長は自院の全員、一般スタッフは自分だけ", async () => {
  const rows = (key) => as(db.client, org.u[key], async (x) => (await x("select user_id, paid, five_day from mgmt.store_leave_summary($1, '2026-11-06')", [org.store.HIRAKATA])).rows);
  const m = await rows("mgr_HIRAKATA");
  assert.ok(m.some((r) => r.user_id === org.u.staff_HIRAKATA));
  assert.ok(m.some((r) => r.user_id === org.u.mgr_HIRAKATA));
  const st = m.find((r) => r.user_id === org.u.staff_HIRAKATA);
  assert.equal(st.paid.grants, undefined, "一覧には付与ごとの明細を含めない");
  assert.equal(st.five_day.target, true);
  const s = await rows("staff_HIRAKATA");
  assert.deepEqual(s.map((r) => r.user_id), [org.u.staff_HIRAKATA]);
  assert.deepEqual(await rows("mgr_TSUDA"), []);
});

test("振休の発生の登録：自院の院長と社長はできる、他院の院長・スタッフはできない、同じ出勤日は二重登録できない", async () => {
  const reg = (key, userKey, date = "2026-11-03", t = "SHIFT_HOLIDAY") =>
    as(db.client, org.u[key], async (x) => (await x("select mgmt.register_shift_earned($1,$2,$3,'文化の日に出勤') id", [org.u[userKey], t, date])).rows[0].id);
  assert.ok(await reg("mgr_OWADA", "staff_OWADA"));
  assert.ok(await reg("president", "staff_OWADA"));
  for (const key of ["mgr_KORIEN", "staff_OWADA", "gm"]) await assert.rejects(reg(key, "staff_OWADA"), /権限がありません/, key);
  await assert.rejects(reg("mgr_OWADA", "staff_OWADA", "2099-01-01"), /未来の日付/);
  // 永続化して二重登録を確認
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: org.u.mgr_OWADA })]);
  await q("set role authenticated");
  await q("select mgmt.register_shift_earned($1,'SHIFT','2026-11-01',null)", [org.u.staff_OWADA]);
  await assert.rejects(q("select mgmt.register_shift_earned($1,'SHIFT_HOLIDAY','2026-11-01',null)", [org.u.staff_OWADA]), /すでに登録/);
  await q("reset role");
  await q("select set_config('request.jwt.claims', '', false)");
  const b = await balance("mgr_OWADA", "staff_OWADA", "SHIFT", "2026-11-06");
  assert.deepEqual([b.current, b.next_expiry_date], [1, "2026-11-30"]);
});

test("同じ人・同じ付与日の法定付与は二重に登録できない", async () => {
  await grant("staff_TAGUCHIYAMA", "PAID", "2025-04-01", 10);
  await assert.rejects(grant("staff_TAGUCHIYAMA", "PAID", "2025-04-01", 10), /duplicate key/);
  await q("select set_config('request.jwt.claims', '', false)");
});
