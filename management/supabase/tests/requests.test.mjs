// PHASE 4：有給・振休の申請と承認のテスト（ローカルの PostgreSQL で実行）
// 対応する検証項目：T-01（有給は社長だけ）・T-02（院長が自院の振休）・T-03（他院は不可）・T-04（自己承認の防止と院長本人の例外）
//                  T-08（取消で残数が戻る）・二重承認／同時承認・差戻し→再申請・却下の理由
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, as } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org;
const q = (sql, p) => db.client.query(sql, p);
after(async () => { if (db) await db.stop(); });

// 永続化する操作（as() はロールバックするので、続けて使う操作は authenticated として直接実行する）
async function run(userKey, sql, params = []) {
  await q("begin");
  try {
    await q("set local role authenticated");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: org.u[userKey], role: "authenticated" })]);
    const r = await q(sql, params);
    await q("commit");
    return r.rows;
  } catch (e) { await q("rollback"); throw e; }
}
const grant = (userKey, code, date, days) => run("president",
  "select mgmt.add_leave_grant($1,$2,$3,$4,$5,$6) id", [org.u[userKey], code, date, days, code === "PAID" ? "statutory" : "shift_earned", code === "PAID" ? null : date]);
const submit = async (who, forKey, kind, dates, note = null, key = null) =>
  (await run(who, "select mgmt.submit_leave_request($1,$2,$3::date[],null,$4,$5) id", [org.u[forKey], kind, dates, note, key]))[0].id;
const stepOf = async (reqId) => (await q("select id, version from mgmt.approval_steps where leave_request_id = $1 and status = 'pending'", [reqId])).rows[0];
const decide = async (who, reqId, action, reason = null, cat = null, key = null) => {
  const s = await stepOf(reqId);
  return (await run(who, "select mgmt.decide_leave_step($1,$2,$3,$4,$5,$6) st", [s.id, action, reason, cat, s.version, key]))[0].st;
};
const bal = async (userKey, code, asOf = "2026-11-07") => (await run("president", "select mgmt.leave_balance($1,$2,$3) b", [org.u[userKey], code, asOf]))[0].b;
const status = async (id) => (await q("select status from mgmt.leave_requests where id = $1", [id])).rows[0].status;

before(async () => {
  db = await startDb();
  org = await buildOrg(q);
  await grant("staff_IBARAKI", "PAID", "2026-04-01", 10);
  await grant("staff_KORIEN", "PAID", "2026-04-01", 10);
  await grant("mgr_IBARAKI", "PAID", "2026-04-01", 10);
  await grant("staff_IBARAKI", "SHIFT_HOLIDAY", "2026-11-03", 1);
  await grant("staff_IBARAKI", "SHIFT", "2026-11-01", 1);
  await grant("mgr_IBARAKI", "SHIFT", "2026-11-01", 1);
  await grant("staff_KORIEN", "SHIFT", "2026-11-01", 1);
});

test("T-01：有給の最終承認は社長だけ。承認で取得予定になり、利用可能残数が減る", async () => {
  const id = await submit("staff_IBARAKI", "staff_IBARAKI", "PAID", ["2026-12-10", "2026-12-11"]);
  let b = await bal("staff_IBARAKI", "PAID");
  assert.deepEqual([b.current, b.after_planned, b.pending], [10, 10, 2], "申請中は確定減算しない");
  for (const key of ["gm", "bmSouth", "mgr_IBARAKI", "staff_KORIEN"]) {
    await assert.rejects(decide(key, id, "approve"), /社長だけ/, key);
  }
  assert.equal(await decide("president", id, "approve"), "approved");
  b = await bal("staff_IBARAKI", "PAID");
  assert.deepEqual([b.current, b.after_planned, b.planned, b.pending], [10, 8, 2, 0]);
  // 承認の記録（スナップショット付き）
  const ev = (await q("select action, actor_user_id, snapshot->>'total_days' d from mgmt.approval_events where request_id = $1 order by id", [id])).rows;
  assert.deepEqual(ev.map((e) => e.action), ["submit", "approve"]);
  assert.equal(ev[1].actor_user_id, org.u.president);
  // 申請者への通知（1回だけ）
  const n = (await q("select count(*)::int c from mgmt.notifications where user_id = $1 and kind = 'leave_decided'", [org.u.staff_IBARAKI])).rows[0].c;
  assert.equal(n, 1);
});

test("T-02・T-03：振休は承認院の院長が承認。他院の院長・社長・GMはできない", async () => {
  const id = await submit("staff_IBARAKI", "staff_IBARAKI", "SHIFT", ["2026-11-20"]);
  for (const key of ["mgr_KORIEN", "president", "gm", "bmSouth"]) {
    await assert.rejects(decide(key, id, "approve"), /茨木院の院長だけ/, key);
  }
  assert.equal(await decide("mgr_IBARAKI", id, "approve"), "approved");
  // 期限の早いものから。期限が同じ（どちらも11/30）なら、先に出勤した日の振休（11/1の振替）から使う
  const u = (await q("select t.code from mgmt.leave_usage u join mgmt.leave_types t on t.id = u.leave_type_id where u.leave_request_id = $1", [id])).rows;
  assert.deepEqual(u.map((r) => r.code), ["SHIFT"]);
});

test("T-04：自己承認の防止。院長本人の振休だけは本人承認でき、GM・社長に通知される", async () => {
  // 院長本人の有給 → 院長は承認者ではない（社長のみ）
  const paid = await submit("mgr_IBARAKI", "mgr_IBARAKI", "PAID", ["2026-12-15"]);
  await assert.rejects(decide("mgr_IBARAKI", paid, "approve"), /社長だけ/);
  // 院長本人の振休 → 本人承認（例外）
  const shift = await submit("mgr_IBARAKI", "mgr_IBARAKI", "SHIFT", ["2026-11-21"]);
  assert.equal(await decide("mgr_IBARAKI", shift, "approve"), "approved");
  const st = (await q("select self_approved from mgmt.approval_steps where leave_request_id = $1", [shift])).rows[0];
  assert.equal(st.self_approved, true);
  const notified = (await q("select user_id from mgmt.notifications where kind = 'self_approved'")).rows.map((r) => r.user_id).sort();
  assert.deepEqual(notified, [org.u.gm, org.u.president].sort());
  // 社長が自分の申請を承認することはできない（社長に有給を付与して確認）
  await grant("president", "PAID", "2026-04-01", 10);
  await q("insert into mgmt.user_store_assignments (user_id, store_id, role_id, is_primary, starts_on) values ($1,$2,$3,true,'2026-01-01')", [org.u.president, org.store.HIRAKATA, org.role.STAFF]);
  const own = await submit("president", "president", "PAID", ["2026-12-24"]);
  await assert.rejects(decide("president", own, "approve"), /自分の申請は承認できません/);
});

test("院長の代理申請は有給だけ。代理申請した院長はその申請を承認できない", async () => {
  await assert.rejects(submit("mgr_IBARAKI", "staff_IBARAKI", "SHIFT", ["2026-11-25"]), /振休は本人が申請/);
  await assert.rejects(submit("mgr_KORIEN", "staff_IBARAKI", "PAID", ["2026-12-18"]), /代理で申請する権限がありません/);
  const id = await submit("mgr_IBARAKI", "staff_IBARAKI", "PAID", ["2026-12-18"]);
  const r = (await q("select submitted_by from mgmt.leave_requests where id = $1", [id])).rows[0];
  assert.equal(r.submitted_by, org.u.mgr_IBARAKI);
  assert.equal(await decide("president", id, "approve"), "approved");
});

test("二重申請の防止：同じ日・承認待ちと重なる日は申請できない", async () => {
  await assert.rejects(submit("staff_IBARAKI", "staff_IBARAKI", "PAID", ["2026-12-10"]), /すでに申請中か、取得予定があります/);
  await assert.rejects(submit("staff_IBARAKI", "staff_IBARAKI", "PAID", ["2026-12-30", "2026-12-30"]), /同じ日が2回/);
});

test("残数不足：理由が無ければ申請できず、例外確認として申請できる。承認時に足りなければ承認できない", async () => {
  // 香里園スタッフは有給10日。11日を申請
  const days = Array.from({ length: 11 }, (_, i) => `2027-01-${String(i + 4).padStart(2, "0")}`);
  await assert.rejects(submit("staff_KORIEN", "staff_KORIEN", "PAID", days), /残数が足りません/);
  const id = await submit("staff_KORIEN", "staff_KORIEN", "PAID", days, "繁忙期明けにまとめて休みたい");
  assert.equal((await q("select balance_shortage from mgmt.leave_requests where id = $1", [id])).rows[0].balance_shortage, true);
  await assert.rejects(decide("president", id, "approve"), /足りないため承認できません/);
  assert.equal(await status(id), "pending", "失敗した承認は何も変えない");
  assert.equal((await q("select count(*)::int c from mgmt.leave_usage where leave_request_id = $1", [id])).rows[0].c, 0);
  assert.equal(await decide("president", id, "return", "日数を減らして再申請してください"), "returned");
  // 再申請（10日に減らす）→ 承認
  await run("staff_KORIEN", "select mgmt.resubmit_leave_request($1, $2::date[])", [id, days.slice(0, 10)]);
  assert.equal(await status(id), "pending");
  assert.equal((await q("select count(*)::int c from mgmt.approval_steps where leave_request_id = $1", [id])).rows[0].c, 2);
  assert.equal(await decide("president", id, "approve"), "approved");
  const b = await bal("staff_KORIEN", "PAID");
  assert.equal(b.after_planned, 0);
});

test("差戻し・却下は理由が必須。有給の却下は理由の区分も必須（Q-9）", async () => {
  const id = await submit("staff_TSUDA", "staff_TSUDA", "PAID", ["2026-12-01"], "付与前だが申請");
  const step = await stepOf(id);
  await assert.rejects(decide("president", id, "reject"), /理由を入力/);
  await assert.rejects(decide("president", id, "reject", "業務の都合"), /理由の区分/);
  assert.equal(await decide("president", id, "reject", "年末の繁忙期のため別日にお願いします", "時季変更の申し入れ"), "rejected");
  const ev = (await q("select reason_category from mgmt.approval_events where request_id = $1 and action = 'reject'", [id])).rows[0];
  assert.equal(ev.reason_category, "時季変更の申し入れ");
  await assert.rejects(run("president", "select mgmt.decide_leave_step($1,'approve')", [step.id]), /すでに処理されています/);
});

test("二重承認の防止：同じ冪等キーは1回分だけ、古いバージョンでの承認は拒否", async () => {
  await grant("staff_OWADA", "PAID", "2026-04-01", 10);
  const id = await submit("staff_OWADA", "staff_OWADA", "PAID", ["2026-12-21"]);
  const s = await stepOf(id);
  const call = (key, ver = s.version) => run("president", "select mgmt.decide_leave_step($1,'approve',null,null,$2,$3) st", [s.id, ver, key]);
  assert.equal((await call("k-1"))[0].st, "approved");
  assert.equal((await call("k-1"))[0].st, "approved", "同じキーの二度押しは前回の結果を返す");
  assert.equal((await q("select count(*)::int c from mgmt.leave_usage where leave_request_id = $1", [id])).rows[0].c, 1, "減算は1回だけ");
  const id2 = await submit("staff_OWADA", "staff_OWADA", "PAID", ["2026-12-22"]);
  const s2 = await stepOf(id2);
  await assert.rejects(run("president", "select mgmt.decide_leave_step($1,'approve',null,null,$2,null)", [s2.id, s2.version + 5]), /先に処理しました/);
});

test("同時承認：残り1日に対する2件の申請を同時に承認しても、マイナスにならない", async () => {
  await grant("staff_TAGUCHIYAMA", "PAID", "2026-04-01", 1);
  const a = await submit("staff_TAGUCHIYAMA", "staff_TAGUCHIYAMA", "PAID", ["2026-12-01"]);
  const b = await submit("staff_TAGUCHIYAMA", "staff_TAGUCHIYAMA", "PAID", ["2026-12-02"], "2件目");
  const { default: pg } = await import("pg");
  const c1 = new pg.Client(db.client.connectionParameters), c2 = new pg.Client(db.client.connectionParameters);
  await c1.connect(); await c2.connect();
  const approveOn = async (c, reqId) => {
    const s = await stepOf(reqId);
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: org.u.president })]);
    try { await c.query("select mgmt.decide_leave_step($1,'approve',null,null,$2,null)", [s.id, s.version]); await c.query("commit"); return "ok"; }
    catch (e) { await c.query("rollback"); return e.message; }
  };
  const results = await Promise.all([approveOn(c1, a), approveOn(c2, b)]);
  await c1.end(); await c2.end();
  assert.equal(results.filter((r) => r === "ok").length, 1, results.join(" / "));
  assert.match(results.find((r) => r !== "ok"), /足りないため承認できません/);
  const bl = await bal("staff_TAGUCHIYAMA", "PAID");
  assert.equal(bl.after_planned, 0);
});

test("T-08：取消で残数が元に戻る（2回取り消しても1回分）。取得済みを含むと社長だけ", async () => {
  await grant("staff_HIRAKATA", "PAID", "2026-04-01", 10);
  const id = await submit("staff_HIRAKATA", "staff_HIRAKATA", "PAID", ["2026-11-10", "2026-12-28"]);
  await decide("president", id, "approve");
  assert.equal((await bal("staff_HIRAKATA", "PAID")).after_planned, 8);
  // 11/10 を過ぎたので取得済みに（日次ジョブ）
  assert.ok((await run("president", "select mgmt.confirm_leave_taken('2026-11-11') n"))[0].n >= 1);
  await assert.rejects(run("staff_HIRAKATA", "select mgmt.cancel_leave_request($1,'予定が変わった')", [id]), /社長が行います/);
  await assert.rejects(run("president", "select mgmt.cancel_leave_request($1,'')", [id]), /理由/);
  await run("president", "select mgmt.cancel_leave_request($1,'実際は出勤していたため訂正')", [id]);
  assert.equal((await bal("staff_HIRAKATA", "PAID")).after_planned, 10);
  await assert.rejects(run("president", "select mgmt.cancel_leave_request($1,'もう一度')", [id]), /承認済みの申請だけ/);
  assert.equal((await bal("staff_HIRAKATA", "PAID")).after_planned, 10);
  // 取得前の取消は本人もできる
  const id2 = await submit("staff_HIRAKATA", "staff_HIRAKATA", "PAID", ["2026-12-29"]);
  await decide("president", id2, "approve");
  await run("staff_HIRAKATA", "select mgmt.cancel_leave_request($1,'予定が変わった')", [id2]);
  assert.equal(await status(id2), "cancelled");
});

test("取下げ・承認待ちの一覧・見る権限", async () => {
  await assert.rejects(submit("staff_KATANO", "staff_KATANO", "SHIFT", ["2026-11-28"]), /残数が足りません/);
  await grant("staff_KATANO", "SHIFT", "2026-11-02", 1);
  const r = await submit("staff_KATANO", "staff_KATANO", "SHIFT", ["2026-11-28"]);
  // 交野院の院長（dual 兼務者を含む）の承認待ちに出る。茨木院の院長には出ない
  const queue = async (key) => (await run(key, "select request_id from mgmt.my_approval_queue()")).map((x) => x.request_id);
  assert.ok((await queue("mgr_KATANO")).includes(r));
  assert.ok((await queue("dual")).includes(r));
  assert.ok(!(await queue("mgr_IBARAKI")).includes(r));
  assert.ok(!(await queue("president")).includes(r), "振休は社長の承認待ちに出ない");
  // 見る権限：本人・交野院の院長は見える、他院のスタッフは見えない
  const seen = async (key) => (await run(key, "select count(*)::int c from mgmt.leave_requests where id = $1", [r]))[0].c;
  assert.equal(await seen("staff_KATANO"), 1);
  assert.equal(await seen("mgr_KATANO"), 1);
  assert.equal(await seen("staff_IBARAKI"), 0);
  assert.equal(await seen("mgr_IBARAKI"), 0);
  await assert.rejects(run("staff_IBARAKI", "select mgmt.withdraw_leave_request($1)", [r]), /見つかりません/);
  await run("staff_KATANO", "select mgmt.withdraw_leave_request($1)", [r]);
  assert.equal(await status(r), "withdrawn");
  assert.ok(!(await queue("mgr_KATANO")).includes(r));
  // 直接の書き込みはできない
  await assert.rejects(run("president", "update mgmt.leave_requests set status = 'approved' where id = $1", [r]), /permission denied/);
  await assert.rejects(run("president", "insert into mgmt.approval_events (request_kind, request_id, action) values ('leave', $1, 'approve')", [r]), /permission denied/);
  await assert.rejects(q("delete from mgmt.approval_events"), /変更・削除できません/);
});
