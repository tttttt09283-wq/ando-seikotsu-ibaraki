// PHASE 7：院内会議・議事録・決定事項・タスクのテスト（ローカルの PostgreSQL で実行）
// 対応する検証項目：T-10（議事録期限は開催日＋3日 23:59:59 JST）・T-11（期限超過の判定）・T-18（POSの会議との共用）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org, D;
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
  // POSとの紐づけ：茨木院＝POSの店舗2、茨木スタッフ＝POSのスタッフ50
  await q("insert into public.stores (id, name) values (1, '香里園駅前院'), (2, '茨木院')");
  await q("update mgmt.stores set pos_store_id = 2 where code = 'IBARAKI'");
  await q("insert into public.clinic_staff (id, name, email, store_ids) values (50, 'POSスタッフ', 'p@x', '{2}'), (51, '共用', 'k@x', '{}')");
  await q("update mgmt.users set pos_staff_id = 50 where id = $1", [org.u.staff_IBARAKI]);
  D = (await q(`select (mgmt.jst_today() + 7)::text future, (mgmt.jst_today() - 1)::text yesterday, (mgmt.jst_today() - 10)::text old,
    (mgmt.jst_today() - 2)::text d1, (mgmt.jst_today() - 3)::text d0, (mgmt.jst_today() + 14)::text due`)).rows[0];
});
after(async () => { if (db) await db.stop(); });

const create = async (who, store, held_on, title = "院内ミーティング") =>
  Number((await run(who, "select mgmt.create_meeting($1,$2,$3) id", [org.store[store], held_on, title]))[0].id);
const save = (who, id, { agenda = "今月の数値の確認", content = "新規の来院数と再来率を確認した", attendees = ["mgr_IBARAKI", "staff_IBARAKI"], guests = [],
  decisions = [{ title: "口コミのPOPを作る", detail: "受付に置くPOPを3種類作って掲示する", owner: "staff_IBARAKI", due: D.due }], noDecisions = false, submit = true } = {}) =>
  run(who, "select mgmt.save_minutes($1,$2,$3,$4,$5,$6,$7,$8) st", [id, agenda, content, attendees.map((k) => org.u[k]), guests,
    JSON.stringify(decisions.map((d) => ({ id: d.id ?? null, title: d.title, detail: d.detail, owner_user_id: d.owner ? org.u[d.owner] : null, due_date: d.due }))), noDecisions, submit]);

test("T-10・T-11：期限は開催日＋3日の 23:59:59（日本時間・暦日）。サーバーのタイムゾーンに関係なく同じ", async () => {
  const cases = [["2026-11-05", "2026-11-08"], ["2026-11-27", "2026-11-30"], ["2026-12-30", "2027-01-02"], ["2027-02-26", "2027-03-01"], ["2028-02-27", "2028-03-01"]];
  for (const tz of ["UTC", "America/New_York", "Asia/Tokyo"]) {
    await q(`set timezone = '${tz}'`);
    for (const [held, due] of cases) {
      const r = (await q(`select to_char(mgmt.minutes_due_at($1::date) at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') due,
        mgmt.minutes_is_late($1::date, ($2 || ' 23:59:59.9+09')::timestamptz) at_end, mgmt.minutes_is_late($1::date, ($3 || ' 00:00:00+09')::timestamptz) next_day,
        mgmt.minutes_is_late($1::date, ($1 || ' 22:00+09')::timestamptz + interval '72 hours') h72`,
      [held, due, (await q("select ($1::date + 1)::text d", [due])).rows[0].d])).rows[0];
      assert.deepEqual(r, { due: `${due} 23:59:59`, at_end: false, next_day: true, h72: false }, `${tz} ${held}`);
    }
  }
  await q("reset timezone");
});

test("院長が自院の会議を登録。他院の院長・スタッフは登録できない。見られるのは自院・担当エリア・全社の役職者", async () => {
  const id = await create("mgr_IBARAKI", "IBARAKI", D.future);
  for (const key of ["mgr_KORIEN", "staff_IBARAKI", "bmSouth"]) await assert.rejects(create(key, "IBARAKI", D.future), /院長・GM・社長/, key);
  assert.ok(await create("gm", "IBARAKI", D.future, "GM主催の会議"));
  const seen = async (key) => (await run(key, "select count(*)::int c from mgmt.list_meetings() where id = $1", [id]))[0].c;
  assert.deepEqual(await Promise.all(["mgr_IBARAKI", "staff_IBARAKI", "bmSouth", "gm", "president"].map(seen)), [1, 1, 1, 1, 1]);
  assert.deepEqual(await Promise.all(["mgr_KORIEN", "mgr_HIRAKATA", "staff_KORIEN"].map(seen)), [0, 0, 0]);
  assert.equal((await run("mgr_KORIEN", "select mgmt.get_meeting($1) m", [id]))[0].m, null);
  const m = (await run("mgr_IBARAKI", "select * from mgmt.list_meetings() where id = $1", [id]))[0];
  assert.equal(m.status, "scheduled");
  // 開催日より前には提出できない（下書きはできる）
  await assert.rejects(save("mgr_IBARAKI", id), /開催日より前には提出できません/);
  assert.equal((await save("mgr_IBARAKI", id, { submit: false, content: "" }))[0].st, "scheduled");
  // 議事録・参加者の表は直接読めない
  await assert.rejects(run("mgr_IBARAKI", "select * from mgmt.meeting_minutes"), /permission denied/);
});

test("POSで登録した会議にも期限と院が付く（作成者の所属から院を決める）", async () => {
  const pos = (await q("insert into public.meetings (held_on, title, created_by) values ($1, 'POSの会議', 50) returning id", [D.yesterday])).rows[0].id;
  const r = (await q("select mgmt_store_id, minutes_status, to_char(minutes_due_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') due, (mgmt.jst_today() + 2)::text exp from public.meetings where id = $1", [pos])).rows[0];
  assert.equal(r.mgmt_store_id, org.store.IBARAKI);
  assert.equal(r.minutes_status, "awaiting_minutes");
  assert.equal(r.due, `${r.exp} 23:59:59`);
  // 共用アカウント（所属なし）が作った会議は院が未設定 → 全社の役職者だけが見られ、院を設定できる
  const shared = Number((await q("insert into public.meetings (held_on, title, created_by) values ($1, '共用で作成', 51) returning id", [D.yesterday])).rows[0].id);
  assert.equal((await run("mgr_IBARAKI", "select count(*)::int c from mgmt.list_meetings() where id = $1", [shared]))[0].c, 0);
  await assert.rejects(save("gm", shared), /院が設定されていません/);
  await run("gm", "select mgmt.update_meeting($1, null, '共用で作成', $2)", [shared, org.store.IBARAKI]);
  assert.equal((await run("mgr_IBARAKI", "select count(*)::int c from mgmt.list_meetings() where id = $1", [shared]))[0].c, 1);
  // POSで登録した行動計画は、POSのスタッフ番号から担当者がつながる
  await q("insert into public.action_items (title, owner_staff_id, meeting_id, source) values ('POSのタスク', 50, $1, 'meeting')", [pos]);
  const a = (await q("select owner_user_id, mgmt_store_id from public.action_items where title = 'POSのタスク'")).rows[0];
  assert.deepEqual(a, { owner_user_id: org.u.staff_IBARAKI, mgmt_store_id: org.store.IBARAKI });
});

test("議事録の正式提出：必須項目・決定事項の担当／期限／具体的な行動・「決定事項なし」の明示", async () => {
  const id = await create("mgr_IBARAKI", "IBARAKI", D.yesterday);
  await assert.rejects(save("mgr_IBARAKI", id, { agenda: "" }), /議題/);
  await assert.rejects(save("mgr_IBARAKI", id, { content: " " }), /会議の内容/);
  await assert.rejects(save("mgr_IBARAKI", id, { attendees: [] }), /参加者/);
  await assert.rejects(save("mgr_IBARAKI", id, { decisions: [] }), /決定事項なし/);
  await assert.rejects(save("mgr_IBARAKI", id, { decisions: [{ title: "掃除の分担", detail: "", owner: "staff_IBARAKI", due: D.due }] }), /具体的な行動/);
  await assert.rejects(save("mgr_IBARAKI", id, { decisions: [{ title: "掃除の分担", detail: "毎朝の担当を決める", owner: null, due: D.due }] }), /担当者/);
  await assert.rejects(save("mgr_IBARAKI", id, { decisions: [{ title: "掃除の分担", detail: "毎朝の担当を決める", owner: "staff_IBARAKI", due: null }] }), /実施期限/);
  await assert.rejects(save("mgr_KORIEN", id), /会議が見つかりません/);
  await assert.rejects(save("staff_IBARAKI", id), /院長・GM・社長/);

  assert.equal((await save("mgr_IBARAKI", id, { guests: ["外部講師"] }))[0].st, "submitted");
  const m = (await q("select minutes_status, minutes_submitted_late, minutes_submitted_at from public.meetings where id = $1", [id])).rows[0];
  assert.equal(m.minutes_status, "submitted"); assert.equal(m.minutes_submitted_late, false);
  const dec = (await q("select id, owner_user_id, owner_staff_id, is_decision, source, mgmt_store_id, store_id from public.action_items where meeting_id = $1", [id])).rows;
  assert.equal(dec.length, 1);
  assert.deepEqual({ ...dec[0], id: undefined }, { id: undefined, owner_user_id: org.u.staff_IBARAKI, owner_staff_id: 50, is_decision: true, source: "meeting", mgmt_store_id: org.store.IBARAKI, store_id: 2 });
  const n = (await q("select count(*)::int c from mgmt.notifications where user_id = $1 and kind = 'task_assigned'", [org.u.staff_IBARAKI])).rows[0].c;
  assert.equal(n, 1);
  const detail = (await run("staff_IBARAKI", "select mgmt.get_meeting($1) m", [id]))[0].m;
  assert.deepEqual(detail.attendees.map((a) => a.name), ["テストmgr_IBARAKI", "テストstaff_IBARAKI", "外部講師"]);
  assert.equal(detail.can_edit, false);

  // 提出後：下書き保存はできず、修正は再提出（版が増える。最初の提出日時はそのまま）。会議の変更・削除はできない
  await assert.rejects(save("mgr_IBARAKI", id, { submit: false }), /修正して再提出/);
  await save("mgr_IBARAKI", id, { decisions: [{ id: dec[0].id, title: "口コミのPOPを作る", detail: "受付と施術室に掲示する", owner: "staff_IBARAKI", due: D.due },
    { title: "予約の空き枠を共有", detail: "朝礼で当日の空き枠を伝える", owner: "mgr_IBARAKI", due: D.due }] });
  const m2 = (await q("select minutes_submitted_at from public.meetings where id = $1", [id])).rows[0];
  assert.deepEqual(m2.minutes_submitted_at, m.minutes_submitted_at);
  const revs = (await q("select revision, snapshot -> 'decisions' d from mgmt.meeting_minutes_revisions where meeting_id = $1 order by revision", [id])).rows;
  assert.deepEqual(revs.map((r) => [r.revision, r.d.length]), [[1, 1], [2, 2]]);
  assert.equal((await q("select count(*)::int c from mgmt.notifications where user_id = $1 and kind = 'task_assigned'", [org.u.staff_IBARAKI])).rows[0].c, 1, "同じ決定事項の通知は1回だけ");
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.update_meeting($1, $2, '変更')", [id, D.yesterday]), /変更できません/);
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.delete_meeting($1)", [id]), /削除できません/);

  // 決定事項なしの会議
  const id2 = await create("mgr_IBARAKI", "IBARAKI", D.yesterday, "朝礼");
  await assert.rejects(save("mgr_IBARAKI", id2, { noDecisions: true }), /空にしてください/);
  assert.equal((await save("mgr_IBARAKI", id2, { decisions: [], noDecisions: true }))[0].st, "submitted");
});

test("期限を過ぎた会議は「期限超過」、提出すると「提出済み（期限超過）」", async () => {
  const id = await create("mgr_IBARAKI", "IBARAKI", D.old, "問題解決会議");
  assert.equal((await run("mgr_IBARAKI", "select status from mgmt.list_meetings() where id = $1", [id]))[0].status, "overdue");
  await save("mgr_IBARAKI", id, { decisions: [], noDecisions: true });
  const r = (await run("mgr_IBARAKI", "select status, submitted_late from mgmt.list_meetings() where id = $1", [id]))[0];
  assert.deepEqual(r, { status: "submitted", submitted_late: true });
  assert.equal((await q("select late from mgmt.meeting_minutes_revisions where meeting_id = $1", [id])).rows[0].late, true);
});

test("タスク：担当者は自分のタスクの進み具合を更新できる。院長は院のタスクを登録・変更・削除できる", async () => {
  const mine = await run("staff_IBARAKI", "select id, title, is_decision, meeting_title from mgmt.my_tasks()");
  const pop = mine.find((t) => t.title === "口コミのPOPを作る");
  assert.ok(pop && pop.is_decision);
  await run("staff_IBARAKI", "select mgmt.update_task_progress($1, 'doing', 50, '2種類できた')", [pop.id]);
  await assert.rejects(run("staff_KORIEN", "select mgmt.update_task_progress($1, 'done', 100)", [pop.id]), /見つかりません/);
  await run("staff_IBARAKI", "select mgmt.update_task_progress($1, 'done', 10)", [pop.id]);
  assert.deepEqual((await q("select status, progress, progress_note, done_at is not null done from public.action_items where id = $1", [pop.id])).rows[0],
    { status: "done", progress: 100, progress_note: "2種類できた", done: true });
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.delete_task($1)", [pop.id]), /議事録の修正/);

  const t = Number((await run("mgr_IBARAKI", "select mgmt.create_task($1, '受付の整理', '棚を片づける', $2, $3, 'low') id", [org.store.IBARAKI, org.u.staff_IBARAKI, D.due]))[0].id);
  await assert.rejects(run("mgr_KORIEN", "select mgmt.create_task($1, '受付の整理', null, $2, null)", [org.store.IBARAKI, org.u.staff_IBARAKI]), /院長・GM・社長/);
  await assert.rejects(run("staff_IBARAKI", "select mgmt.create_task($1, '受付の整理', null, $2, null)", [org.store.IBARAKI, org.u.staff_IBARAKI]), /院長・GM・社長/);
  assert.equal((await run("mgr_KORIEN", "select count(*)::int c from mgmt.store_tasks($1)", [org.store.IBARAKI]))[0].c, 0);
  assert.ok((await run("mgr_IBARAKI", "select count(*)::int c from mgmt.store_tasks($1)", [org.store.IBARAKI]))[0].c >= 2);
  await run("mgr_IBARAKI", "select mgmt.update_task($1, '受付の整理', '棚とチラシを片づける', $2, $3, 'mid')", [t, org.u.mgr_IBARAKI, D.due]);
  await run("mgr_IBARAKI", "select mgmt.delete_task($1)", [t]);
  assert.equal((await q("select count(*)::int c from public.action_items where id = $1", [t])).rows[0].c, 0);
  // POSの行動計画としても見える（POSの画面は public.action_items をそのまま読む）
  assert.ok((await q("select count(*)::int c from public.action_items where is_decision and source = 'meeting'")).rows[0].c >= 3);
});

test("期限の通知：前日・当日は院長（＋作成者）、超過は院長・担当BM・GM。同じ通知は1回だけ", async () => {
  const d1 = await create("mgr_KORIEN", "KORIEN", D.d1, "前日の会議");
  const d0 = await create("mgr_KORIEN", "KORIEN", D.d0, "当日の会議");
  const over = await create("mgr_KORIEN", "KORIEN", D.old, "超過の会議");
  const first = (await q("select mgmt.run_minutes_reminders() r")).rows[0].r;
  assert.ok(first.notified >= 5);
  const keys = (await q("select u.name, n.event_key, n.title from mgmt.notifications n join mgmt.users u on u.id = n.user_id where n.link in ($1,$2,$3) order by n.event_key, u.name",
    [`/meetings/${d1}`, `/meetings/${d0}`, `/meetings/${over}`])).rows;
  const who = (id, kind) => keys.filter((k) => k.event_key === `minutes:${id}:${kind}`).map((k) => k.name);
  assert.deepEqual(who(d1, "due:d-1"), ["テストmgr_KORIEN"]);
  assert.deepEqual(who(d0, "due:d0"), ["テストmgr_KORIEN"]);
  assert.deepEqual(who(over, "overdue").sort(), ["テストbmSouth", "テストgm", "テストmgr_KORIEN"].sort());
  assert.match(keys.find((k) => k.event_key === `minutes:${over}:overdue`).title, /^【期限超過】/);
  assert.equal((await q("select mgmt.run_minutes_reminders() r")).rows[0].r.notified, 0);
  assert.equal((await q("select minutes_status from public.meetings where id = $1", [over])).rows[0].minutes_status, "overdue");
  await assert.rejects(run("president", "select mgmt.run_minutes_reminders()"), /permission denied/);
});
