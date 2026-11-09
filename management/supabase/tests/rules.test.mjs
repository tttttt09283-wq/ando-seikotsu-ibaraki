// PHASE 8：社内規定のテスト（ローカルの PostgreSQL で実行）
// 対応する検証項目：FR-RL-1〜4・T-04（自己承認：社長本人の改定案は「本人承認」の印＋GMへの通知）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org;
const q = (sql, p) => db.client.query(sql, p);
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
before(async () => {
  db = await startDb();
  org = await buildOrg(q);
  await q("update mgmt.users set employment_type = 'アルバイト' where id = $1", [org.u.parttimer]);
});
after(async () => { if (db) await db.stop(); });

const rule = async (who, no) => (await run(who, "select mgmt.get_rule($1) r", [no]))[0].r;
const stepOf = async (no) => (await q(`select s.id, s.version from mgmt.approval_steps s join mgmt.company_rule_versions v on v.id = s.rule_version_id
  join mgmt.company_rules r on r.id = v.rule_id where r.rule_no = $1 and s.status = 'pending'`, [no])).rows[0];

test("初期規定 001〜005 は初期案の下書き。公開されるまでスタッフには見えない", async () => {
  const all = await run("president", "select rule_no, working_status, current_version_id from mgmt.list_rules()");
  assert.deepEqual(all.map((r) => [r.rule_no, r.working_status, r.current_version_id]),
    ["001", "002", "003", "004", "005"].map((n) => [n, "draft", null]));
  assert.equal((await q("select bool_and(is_provisional) p from mgmt.company_rule_versions")).rows[0].p, true);
  assert.deepEqual(await run("staff_IBARAKI", "select * from mgmt.list_rules()"), []);
  assert.equal(await rule("staff_IBARAKI", "001"), null);
  assert.equal((await run("gm", "select count(*)::int c from mgmt.list_rules()"))[0].c, 5, "GMは下書きも見える");
  // 表は直接読めない
  await assert.rejects(run("president", "select * from mgmt.company_rule_versions"), /permission denied/);
});

test("GMの改定案を社長が承認して公開。対象者全員に通知し、版ごとに確認を記録", async () => {
  const w = (await rule("gm", "001")).working;
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.update_rule_draft($1,'院内会議',$2,'{}',null,true,null)", [w.id, "本文"]), /社長・GM/);
  await assert.rejects(run("gm", "select mgmt.submit_rule_version($1)", [w.id]), /施行日/);
  await run("gm", "select mgmt.update_rule_draft($1,$2,$3,'{}','2026-12-01',true,null,$4)", [w.id, "院内会議・議事録提出規定", "## 目的\n会議の記録を残す。\n## 期限\n開催日の3日後。", w.version]);
  await assert.rejects(run("gm", "select mgmt.update_rule_draft($1,'x2','b','{}',null,true,null,$2)", [w.id, w.version]), /ほかの人が先に保存/);
  await run("gm", "select mgmt.submit_rule_version($1)", [w.id]);
  assert.equal((await q("select count(*)::int c from mgmt.notifications where user_id = $1 and kind = 'approval_request' and link = '/rules/001/edit'", [org.u.president])).rows[0].c, 1);
  // 承認待ちの間は編集できない。承認は社長だけ（GMはできない）
  await assert.rejects(run("gm", "select mgmt.update_rule_draft($1,'院内会議','x','{}','2026-12-01',true,null)", [w.id]), /下書きだけ/);
  const s = await stepOf("001");
  await assert.rejects(run("gm", "select mgmt.decide_rule_step($1,'approve')", [s.id]), /社長だけ/);
  await assert.rejects(run("president", "select mgmt.decide_rule_step($1,'reject','x')", [s.id]), /操作が正しくありません/);
  assert.equal((await run("president", "select mgmt.decide_rule_step($1,'approve',null,$2) st", [s.id, s.version]))[0].st, "approved");
  assert.equal((await q("select self_approved from mgmt.company_rule_versions where id = $1", [w.id])).rows[0].self_approved, false);
  // 承認済みでも公開前はスタッフに見えない。公開は社長だけ
  assert.equal(await rule("staff_IBARAKI", "001"), null);
  await assert.rejects(run("gm", "select mgmt.publish_rule_version($1)", [w.id]), /社長だけ/);
  const n = (await run("president", "select mgmt.publish_rule_version($1) n", [w.id]))[0].n;
  const active = (await q("select count(*)::int c from mgmt.users where status = 'active'")).rows[0].c;
  assert.equal(n, active, "適用対象（全員）の有効なユーザーに通知");
  const r = await rule("staff_IBARAKI", "001");
  assert.equal(r.current.version_no, 1); assert.equal(r.current.is_provisional, true); assert.equal(r.working, null);
  assert.equal(r.current.acknowledged_at, null);
  // 確認
  assert.equal((await run("staff_IBARAKI", "select count(*)::int c from mgmt.my_unacknowledged_rules()"))[0].c, 1);
  await run("staff_IBARAKI", "select mgmt.acknowledge_rule($1)", [w.id]);
  await run("staff_IBARAKI", "select mgmt.acknowledge_rule($1)", [w.id]);  // 2回押しても1件
  assert.equal((await run("staff_IBARAKI", "select count(*)::int c from mgmt.my_unacknowledged_rules()"))[0].c, 0);
  const st = await run("president", "select name, acknowledged_at from mgmt.rule_ack_status($1)", [w.id]);
  assert.equal(st.filter((x) => x.acknowledged_at).length, 1);
  assert.deepEqual(await run("staff_IBARAKI", "select * from mgmt.rule_ack_status($1)", [w.id]), [], "スタッフは確認状況を見られない");
  const list = (await run("president", "select target_count, ack_count from mgmt.list_rules() where rule_no = '001'"))[0];
  assert.deepEqual(list, { target_count: active, ack_count: 1 });
});

test("改定：公開中の版を写して改定案を作り、差戻し→再依頼→社長本人の案は「本人承認」でGMに通知。新しい版は確認をやり直す", async () => {
  const r0 = await rule("president", "001");
  const v2 = (await run("president", "select mgmt.create_rule_draft($1) id", [r0.rule_id]))[0].id;
  await assert.rejects(run("gm", "select mgmt.create_rule_draft($1)", [r0.rule_id]), /作業中の改定案/);
  const w = (await rule("president", "001")).working;
  assert.equal(w.version_no, 2); assert.match(w.body, /会議の記録を残す/);
  // 改定内容が無いと依頼できない
  await run("president", "select mgmt.update_rule_draft($1,$2,$3,$4,'2027-01-01',false,null)", [v2, "院内会議・議事録提出規定", w.body + "\n## 決定事項\n担当者・期限・行動を書く。", JSON.stringify({ roles: ["MANAGER", "STAFF"] })]);
  await assert.rejects(run("president", "select mgmt.submit_rule_version($1)", [v2]), /改定内容/);
  await run("president", "select mgmt.update_rule_draft($1,$2,$3,$4,'2027-01-01',false,'決定事項の書き方を追加',null)", [v2, "院内会議・議事録提出規定", w.body + "\n## 決定事項\n担当者・期限・行動を書く。", JSON.stringify({ roles: ["MANAGER", "STAFF"] })]);
  await assert.rejects(run("president", "select mgmt.update_rule_draft($1,'院内会議','本文です本文です','{\"roles\":[\"CEO\"]}','2027-01-01',false,'x',null)", [v2]), /役職が正しくありません/);
  await run("president", "select mgmt.submit_rule_version($1)", [v2]);
  let s = await stepOf("001");
  await assert.rejects(run("president", "select mgmt.decide_rule_step($1,'return','')", [s.id]), /差戻しの理由/);
  assert.equal((await run("president", "select mgmt.decide_rule_step($1,'return','施行日を確認してください') st", [s.id]))[0].st, "draft");
  assert.equal((await rule("president", "001")).working.returned_reason, "施行日を確認してください");
  await run("president", "select mgmt.submit_rule_version($1)", [v2]);
  s = await stepOf("001");
  const queue = await run("president", "select rule_no, self_authored from mgmt.my_rule_queue()");
  assert.deepEqual(queue, [{ rule_no: "001", self_authored: true }]);
  await run("president", "select mgmt.decide_rule_step($1,'approve')", [s.id]);
  assert.equal((await q("select self_approved from mgmt.company_rule_versions where id = $1", [v2])).rows[0].self_approved, true);
  assert.equal((await q("select count(*)::int c from mgmt.notifications where user_id = $1 and kind = 'rule_self_approved'", [org.u.gm])).rows[0].c, 1);
  const ev = (await q("select action, self_approved from mgmt.approval_events where request_kind = 'rule' and request_id = $1 order by id", [v2])).rows;
  assert.deepEqual(ev.map((e) => e.action), ["create", "submit", "return", "submit", "approve"]);
  assert.equal(ev.at(-1).self_approved, true);
  await run("president", "select mgmt.publish_rule_version($1)", [v2]);

  // 旧版になり、新しい版は院長・スタッフだけが対象（アルバイト・GMは対象外）
  const versions = (await q("select version_no, status from mgmt.company_rule_versions v join mgmt.company_rules r on r.id = v.rule_id where r.rule_no = '001' order by version_no")).rows;
  assert.deepEqual(versions, [{ version_no: 1, status: "superseded" }, { version_no: 2, status: "published" }]);
  const staff = await rule("staff_IBARAKI", "001");
  assert.equal(staff.current.version_no, 2); assert.equal(staff.current.acknowledged_at, null, "新しい版は確認をやり直す");
  assert.equal(staff.history.length, 2);
  assert.equal((await rule("parttimer", "001")).current.applies_to_me, false);
  await assert.rejects(run("parttimer", "select mgmt.acknowledge_rule($1)", [v2]), /対象ではありません/);
  await assert.rejects(run("staff_IBARAKI", "select mgmt.acknowledge_rule($1)", [r0.current.id]), /公開中の規定だけ/);
  assert.equal((await q("select count(*)::int c from mgmt.notifications where user_id = $1 and event_key = $2", [org.u.parttimer, `rule:${v2}:published`])).rows[0].c, 0);
  assert.equal((await q("select count(*)::int c from mgmt.notifications where user_id = $1 and event_key = $2", [org.u.staff_IBARAKI, `rule:${v2}:published`])).rows[0].c, 1);
  // 旧版の本文は誰でも読める（改定履歴）
  assert.match((await run("staff_KORIEN", "select mgmt.get_rule_version($1) v", [r0.current.id]))[0].v.body, /会議の記録を残す/);
  // 履歴は改定案を作れる人・社長だけ
  assert.ok((await run("gm", "select count(*)::int c from mgmt.request_history('rule', $1)", [v2]))[0].c >= 5);
  assert.equal((await run("staff_IBARAKI", "select count(*)::int c from mgmt.request_history('rule', $1)", [v2]))[0].c, 0);
});

test("新しい規定の制定・下書きの削除・取下げ", async () => {
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.create_rule('006','服装規定','本文','{}',null,false,null)"), /社長・GM/);
  await assert.rejects(run("gm", "select mgmt.create_rule('6','服装規定','本文','{}',null,false,null)"), /3けた/);
  await assert.rejects(run("gm", "select mgmt.create_rule('001','重複','本文','{}',null,false,null)"), /すでにあります/);
  const v = (await run("gm", "select mgmt.create_rule('006','服装規定','## 服装\n清潔な服装をする。','{\"employment_types\":[\"アルバイト\"]}','2027-01-01',false,null) id"))[0].id;
  await run("gm", "select mgmt.submit_rule_version($1)", [v]);
  await run("gm", "select mgmt.withdraw_rule_version($1)", [v]);
  assert.equal((await q("select status from mgmt.company_rule_versions where id = $1", [v])).rows[0].status, "draft");
  assert.equal((await q("select count(*)::int c from mgmt.approval_steps where rule_version_id = $1 and status = 'pending'", [v])).rows[0].c, 0);
  await run("gm", "select mgmt.delete_rule_draft($1)", [v]);
  assert.deepEqual(await run("gm", "select * from mgmt.list_rules() where rule_no = '006'"), [], "一度も公開していない規定は一覧から消える");
  assert.equal((await q("select status from mgmt.company_rule_versions where id = $1", [v])).rows[0].status, "discarded", "行は消さずに破棄（履歴を残す）");
  // 破棄した番号は使い直せる
  const v2 = (await run("gm", "select mgmt.create_rule('006','身だしなみ規定','## 身だしなみ\n清潔にする。','{}',null,false,null) id"))[0].id;
  assert.equal((await q("select version_no from mgmt.company_rule_versions where id = $1", [v2])).rows[0].version_no, 2);
  // 公開済みの規定の改定案を消しても、規定と公開中の版は残る
  const r = await rule("gm", "001");
  const d = (await run("gm", "select mgmt.create_rule_draft($1) id", [r.rule_id]))[0].id;
  await run("gm", "select mgmt.delete_rule_draft($1)", [d]);
  assert.equal((await rule("staff_IBARAKI", "001")).current.version_no, 2);
});
