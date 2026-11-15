// DB（実際の SQL とトリガー）と承認の流れのテスト。PGlite を Postgres のサーバーとして立て、本番と同じ処理で確かめる
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tx, useSql, sql } from "@/lib/db";
import type { Actor } from "@/lib/authz";
import { SECTIONS } from "@/lib/import-config";
import { parseManual } from "@/lib/importer";
import * as docs from "@/lib/repo/docs";
import * as members from "@/lib/repo/members";
import { fakeExport } from "./fixtures";

const MIGRATION = fs.readFileSync(path.resolve(__dirname, "../../sql/2026-11-15_manual_system.sql"), "utf8");

let db: PGlite;
let server: PGLiteSocketServer;
let client: postgres.Sql;
const A: Record<string, Actor> = {};
const ids: Record<string, string> = {};

async function mkMember(name: string, position: string, clinic: string | null, extra: Partial<{ admin: boolean }> = {}) {
  const [m] = await sql()`insert into mn_members (name, person_key, is_system_admin) values (${name}, ${name}, ${!!extra.admin}) returning id`;
  await sql()`insert into mn_assignments (member_id, clinic_id, position, valid_from) values (${m.id}, ${clinic}, ${position}, mn_today() - 30)`;
  ids[name] = m.id;
  return m.id as string;
}
const yesterday = () => new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
const actor = async (name: string, via: Actor["via"] = "email") => (await members.loadActor(sql(), ids[name], via))!;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(MIGRATION);
  server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await server.start();
  const conn = server.getServerConn(); // host:port
  client = postgres(`postgres://postgres:postgres@${conn}/postgres`, { max: 1, prepare: false, onnotice: () => {} });
  useSql(client);
  await mkMember("社長", "president", null);
  await mkMember("GM", "gm", null);
  await mkMember("BM", "bm", "taguchiyama");
  await mkMember("院長", "manager", "ibaraki");
  await mkMember("スタッフ", "staff", "ibaraki");
  await mkMember("津田スタッフ", "staff", "tsuda");
  for (const n of ["社長", "GM", "BM", "院長", "スタッフ", "津田スタッフ"]) A[n] = await actor(n);
});

afterAll(async () => {
  await client?.end();
  await server?.stop();
  await db?.close();
});

describe("マイグレーション", () => {
  it("2回流しても壊れない", async () => {
    await sql().unsafe(MIGRATION);
    const [r] = await sql()`select count(*)::int as n from mn_clinics`;
    expect(r.n).toBe(7);
  });
});

describe("原文の取り込みと承認の流れ", () => {
  it("48項目＋ルール候補17件を取り込み、状態は分析書どおり", async () => {
    const parsed = parseManual(fakeExport());
    expect(parsed.missingSections).toEqual([]);
    const r = await tx(A.GM.memberId, (q) => docs.importManual(q, A.GM, parsed));
    expect(r.created).toHaveLength(48 + 17);
    const rows = await sql()`select v.status, count(*)::int as n from mn_doc_versions v group by v.status`;
    const by = Object.fromEntries(rows.map((x) => [x.status, x.n]));
    expect(by.legal_hold).toBe(SECTIONS.filter((s) => s.status === "legal_hold").length);
    expect(by.gm_review).toBe(17);
    // 2回目は何も作らない
    const again = await tx(A.GM.memberId, (q) => docs.importManual(q, A.GM, parsed));
    expect(again.created).toEqual([]);
    expect(again.changed).toEqual([]);
  });

  it("公開前のルールはスタッフに見えない・検索にも出ない", async () => {
    const list = await docs.listDocs(sql(), A["スタッフ"], { kinds: ["rule"] });
    expect(list).toEqual([]);
    const s = await docs.searchDocs(sql(), A["スタッフ"], "RULE-SVC-001", false);
    expect(s.hits).toEqual([]);
  });

  it("下書き→GM確認→社長承認→公開。順番を飛ばせない・権限のない人はできない", async () => {
    const d = (await docs.getDocDetail(sql(), A.GM, "RULE-SVC-001"))!;
    const vid = d.versions[0].id;
    await expect(tx(A["院長"].memberId, (q) => docs.review(q, A["院長"], vid, "gm_approve"))).rejects.toThrow(/権限/);
    await expect(tx(A["社長"].memberId, (q) => docs.review(q, A["社長"], vid, "president_approve"))).rejects.toThrow(/権限/);
    await tx(A.GM.memberId, (q) => docs.review(q, A.GM, vid, "gm_approve", { comment: "OK" }));
    await expect(tx(A.GM.memberId, (q) => docs.review(q, A.GM, vid, "president_approve"))).rejects.toThrow(/権限/);
    await tx(A["社長"].memberId, (q) => docs.review(q, A["社長"], vid, "president_approve"));
    const after = (await docs.getDocDetail(sql(), A["スタッフ"], "RULE-SVC-001"))!;
    expect(after.versions[0].status).toBe("published");
    expect(after.versions[0].effective_on).toBeTruthy();
    expect(after.doc.current_version_id).toBe(vid);
    expect(after.reviews.map((r) => r.action)).toEqual(["president_approve", "gm_approve", "submit"]);
  });

  it("DB でも、社長承認待ちを経ずに公開はできない", async () => {
    const d = (await docs.getDocDetail(sql(), A.GM, "RULE-SVC-002"))!;
    await expect(sql()`update mn_doc_versions set status = 'published' where id = ${d.versions[0].id}`).rejects.toThrow(/社長承認待ち/);
  });

  it("公開されたら対象スタッフに通知、確認済みを記録できる", async () => {
    const [n] = await sql()`select count(*)::int as n from mn_notifications where member_id = ${ids["スタッフ"]} and kind = 'ack'`;
    expect(n.n).toBe(1);
    let list = await docs.listDocs(sql(), A["スタッフ"], { kinds: ["rule"] });
    expect(list.map((x) => [x.code, x.needsAck, x.acked])).toEqual([["RULE-SVC-001", true, false]]);
    await tx(A["スタッフ"].memberId, (q) => docs.ackVersion(q, A["スタッフ"], list[0].current!.id));
    list = await docs.listDocs(sql(), A["スタッフ"], { kinds: ["rule"] });
    expect(list[0].acked).toBe(true);
    const [unread] = await sql()`select count(*)::int as n from mn_notifications where member_id = ${ids["スタッフ"]} and read_at is null`;
    expect(unread.n).toBe(0);
  });

  it("公開済みの版・原文・確認の記録・監査ログは書き換えられない", async () => {
    const d = (await docs.getDocDetail(sql(), A.GM, "RULE-SVC-001"))!;
    const vid = d.versions[0].id;
    await expect(sql()`update mn_doc_versions set body = 'x' where id = ${vid}`).rejects.toThrow(/公開済み/);
    const draft = (await docs.getDocDetail(sql(), A.GM, "MAN-S01"))!.versions[0];
    await expect(sql()`update mn_doc_versions set original_text = 'x' where id = ${draft.id}`).rejects.toThrow(/原文/);
    await expect(sql()`delete from mn_doc_acks`).rejects.toThrow(/追加のみ/);
    await expect(sql()`delete from mn_doc_reviews`).rejects.toThrow(/追加のみ/);
    await expect(sql()`update mn_audit_log set actor = 'x'`).rejects.toThrow(/追加のみ/);
    await expect(sql()`truncate mn_audit_log`).rejects.toThrow(/追加のみ/);
    const [log] = await sql()`select actor from mn_audit_log where table_name = 'mn_doc_reviews' and after ->> 'action' = 'president_approve'`;
    expect(log.actor).toBe(ids["社長"]);
  });

  it("改訂：新しい版を作り、矛盾が解決するまで公開できない。公開で旧版になり、再確認が必要になる", async () => {
    const vid = await tx(A.GM.memberId, (q) => docs.createRevision(q, A.GM, "RULE-SVC-001"));
    await expect(tx(A.GM.memberId, (q) => docs.createRevision(q, A.GM, "RULE-SVC-001"))).rejects.toThrow(/公開されていない版/);
    const input: docs.VersionInput = {
      title: "挨拶（改訂）", body: "改訂した本文", category: "service", importance: "B", targetPositions: [], targetClinics: [],
      effectiveOn: null, changeSummary: "表現の見直し", requiresReack: true,
    };
    await tx(A.GM.memberId, (q) => docs.updateVersion(q, A.GM, vid, input));
    await tx(A.GM.memberId, (q) => docs.addConflict(q, A.GM, vid, "MAN-S01", "原文の挨拶と表現が違う"));
    await tx(A.GM.memberId, (q) => docs.review(q, A.GM, vid, "submit"));
    await tx(A.GM.memberId, (q) => docs.review(q, A.GM, vid, "gm_approve"));
    await expect(tx(A["社長"].memberId, (q) => docs.review(q, A["社長"], vid, "president_approve"))).rejects.toThrow(/矛盾/);
    const c = (await docs.getDocDetail(sql(), A.GM, "RULE-SVC-001"))!.conflicts[0];
    await expect(tx(A["院長"].memberId, (q) => docs.resolveConflict(q, A["院長"], c.id, "x"))).rejects.toThrow(/GM・社長/);
    await tx(A.GM.memberId, (q) => docs.resolveConflict(q, A.GM, c.id, "原文を正とし、表現だけ直す"));
    await tx(A["社長"].memberId, (q) => docs.review(q, A["社長"], vid, "president_approve"));
    const d = (await docs.getDocDetail(sql(), A.GM, "RULE-SVC-001"))!;
    expect(d.versions.map((v) => [v.version_no, v.status])).toEqual([[2, "published"], [1, "superseded"]]);
    expect(d.versions[1].original_text).toContain("⭐患者様が来院時");
    const list = await docs.listDocs(sql(), A["スタッフ"], { kinds: ["rule"] });
    expect([list[0].needsAck, list[0].acked]).toEqual([true, false]);
  });

  it("院ID＋個人PASSのログインでは、院長でも提案・承認の力を使えない", async () => {
    const viaPin = await actor("院長", "pin");
    const input: docs.VersionInput = {
      title: "提案", body: "本文", category: "other", importance: "C", targetPositions: [], targetClinics: [], effectiveOn: null, changeSummary: "", requiresReack: true,
    };
    await expect(tx(viaPin.memberId, (q) => docs.createProposal(q, viaPin, "rule", input, null))).rejects.toThrow(/メールアドレス/);
    const code = await tx(A["院長"].memberId, (q) => docs.createProposal(q, A["院長"], "rule", input, null));
    expect(code).toBe("RULE-OTH-002");
    // 院長の下書きは他の院のスタッフには見えない
    expect(await docs.getDocDetail(sql(), A["津田スタッフ"], code)).toBeNull();
  });

  it("法令確認待ち：社労士の名前と確認日がないと戻せない", async () => {
    const v = (await docs.getDocDetail(sql(), A.GM, "EDU-S12"))!.versions[0];
    expect(v.status).toBe("legal_hold");
    await expect(tx(A.GM.memberId, (q) => docs.review(q, A.GM, v.id, "legal_clear", { comment: "確認済み" }))).rejects.toThrow(/社労士/);
    await tx(A.GM.memberId, (q) => docs.review(q, A.GM, v.id, "legal_clear", { comment: "表現を修正して可", externalReviewer: "〇〇社労士事務所", externalCheckedOn: "2026-11-14" }));
    const d = (await docs.getDocDetail(sql(), A.GM, "EDU-S12"))!;
    expect(d.versions[0].status).toBe("gm_review");
    expect(d.reviews[0].external_reviewer).toBe("〇〇社労士事務所");
  });

  it("代理承認：GM確認を代理した記録が残る", async () => {
    await tx(A["社長"].memberId, (q) => members.addDelegation(q, A["社長"], { fromMember: ids.GM, toMember: ids.BM, validFrom: "2026-01-01", validTo: "2099-12-31", reason: "GM休暇" }));
    const bm = await actor("BM");
    expect(bm.gmDelegations).toEqual([ids.GM]);
    const v = (await docs.getDocDetail(sql(), bm, "RULE-SVC-002"))!.versions[0];
    await tx(bm.memberId, (q) => docs.review(q, bm, v.id, "gm_approve"));
    const d = (await docs.getDocDetail(sql(), A.GM, "RULE-SVC-002"))!;
    expect([d.reviews[0].actor_name, d.reviews[0].via_name]).toEqual(["BM", "GM"]);
  });

  it("検索：言い換え（有休→有給）と2文字の語で探せる。スタッフは公開中だけ", async () => {
    const r = await docs.searchDocs(sql(), A["スタッフ"], "改訂", false);
    expect(r.hits.map((h) => h.code)).toEqual(["RULE-SVC-001"]);
    const t = await docs.searchDocs(sql(), A.GM, "有休", true);
    expect(t.terms).toContain("有給");
    const g = await docs.searchDocs(sql(), A.GM, "テスト文", true);
    expect(g.hits.length).toBeGreaterThan(10);
    const s = await docs.searchDocs(sql(), A["スタッフ"], "テスト文", true); // スタッフは下書きを含められない
    expect(s.hits).toEqual([]);
  });
});

describe("スタッフ・所属・退職", () => {
  it("BM は社長・GM を任命できない。社長はできる", async () => {
    await expect(tx(A.BM.memberId, (q) => members.addAssignment(q, A.BM, { memberId: ids.BM, position: "gm", clinicId: null, isPrimary: true, validFrom: "2026-11-15" }))).rejects.toThrow(/社長だけ/);
  });

  it("担当エリア：その院の担当は1人。前の担当は前日で終わる", async () => {
    await tx(A["社長"].memberId, (q) => members.setArea(q, { memberId: ids.BM, clinicId: "taguchiyama", validFrom: "2026-01-01" }));
    await tx(A["社長"].memberId, (q) => members.setArea(q, { memberId: ids.GM, clinicId: "taguchiyama", validFrom: "2026-02-01" }));
    const rows = await sql()`select member_id, valid_from::text, valid_to::text from mn_areas where clinic_id = 'taguchiyama' order by valid_from`;
    expect(rows.map((r) => [r.member_id, r.valid_to])).toEqual([[ids.BM, "2026-01-31"], [ids.GM, null]]);
    await expect(tx(A["社長"].memberId, (q) => members.setArea(q, { memberId: ids["スタッフ"], clinicId: "tsuda", validFrom: "2026-02-01" }))).rejects.toThrow(/BM・GM/);
  });

  it("退職日を過ぎたらログインできない（記録は残る）", async () => {
    await tx(A["社長"].memberId, (q) => members.retireMember(q, ids["スタッフ"], yesterday()));
    expect(await members.loadActor(sql(), ids["スタッフ"], "pin")).toBeNull();
    const [ack] = await sql()`select count(*)::int as n from mn_doc_acks where member_id = ${ids["スタッフ"]}`;
    expect(ack.n).toBe(1);
  });

  it("台帳からの取り込み：新しい人だけ追加し、台帳の役職から所属を作る", async () => {
    const r = await tx(A.GM.memberId, (q) => members.syncFromLedger(q, [
      { key: "新人A", name: "新人 A", clinics: ["茨木"], role: "", grade: "G1" },
      { key: "院長B", name: "院長 B", clinics: ["交野", "津田"], role: "院長", grade: "G4" },
      { key: "GMC", name: "GM C", clinics: [], role: "", grade: "G6" },
    ], (n) => ({ 茨木: "ibaraki", 交野: "katano", 津田: "tsuda" } as Record<string, string>)[n] ?? null));
    expect(r.added).toEqual(["新人 A", "院長 B"]);
    const b = await members.memberByPersonKey(sql(), "院長B");
    const asg = await sql()`select clinic_id, position, is_primary from mn_assignments where member_id = ${b!.id} order by is_primary desc`;
    expect(asg.map((a) => [a.clinic_id, a.position, a.is_primary])).toEqual([["katano", "manager", true], ["tsuda", "manager", false]]);
    expect(r.notInLedger).toContain("GM");
  });
});
