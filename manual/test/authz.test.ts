import { describe, expect, it } from "vitest";
import { type Actor, canAck, canAdmin, canAssignTop, canDo, canViewVersion, effectivePositions, isTargeted, visibleClinics, type VersionInfo } from "@/lib/authz";
import { decodeSession, encodeSession } from "@/lib/session-token";
import { snippetOf } from "@/lib/repo/docs";

const actor = (over: Partial<Actor> = {}): Actor => ({
  memberId: "m1", name: "テスト", via: "email", isSystemAdmin: false, assignments: [], areaClinics: [], gmDelegations: [], ...over,
});
const v = (over: Partial<VersionInfo> = {}): VersionInfo => ({ status: "published", kind: "rule", createdBy: null, targetPositions: [], targetClinics: [], ...over });

const gm = actor({ assignments: [{ clinicId: null, position: "gm", isPrimary: true }] });
const president = actor({ assignments: [{ clinicId: null, position: "president", isPrimary: true }] });
const bm = actor({ assignments: [{ clinicId: "taguchiyama", position: "bm", isPrimary: true }], areaClinics: ["hirakata", "taguchiyama"] });
const manager = actor({ assignments: [{ clinicId: "ibaraki", position: "manager", isPrimary: true }] });
const staff = actor({ assignments: [{ clinicId: "ibaraki", position: "staff", isPrimary: true }, { clinicId: "owada", position: "staff", isPrimary: false }] });

describe("役職と見られる範囲", () => {
  it("院ID＋個人PASSのログインでは承認の力を外す", () => {
    expect(effectivePositions({ ...manager, via: "pin" })).toEqual(["staff"]);
    expect(effectivePositions(manager)).toEqual(["manager"]);
  });
  it("社長・GM は全院、BM は担当エリア＋所属、スタッフは兼務を含む所属", () => {
    expect(visibleClinics(gm)).toHaveLength(7);
    expect(visibleClinics(bm).sort()).toEqual(["hirakata", "taguchiyama"]);
    expect(visibleClinics(staff).sort()).toEqual(["ibaraki", "owada"]);
  });
  it("対象の判定（役職・院）", () => {
    expect(isTargeted(staff, { targetPositions: [], targetClinics: [] })).toBe(true);
    expect(isTargeted(staff, { targetPositions: ["manager"], targetClinics: [] })).toBe(false);
    expect(isTargeted(staff, { targetPositions: [], targetClinics: ["owada"] })).toBe(true);
    expect(isTargeted(staff, { targetPositions: [], targetClinics: ["tsuda"] })).toBe(false);
    expect(isTargeted(gm, { targetPositions: [], targetClinics: ["tsuda"] })).toBe(true);
  });
  it("院長マニュアルは院長以上だけ", () => {
    expect(canViewVersion(staff, v({ kind: "manager_manual" }))).toBe(false);
    expect(canViewVersion(manager, v({ kind: "manager_manual" }))).toBe(true);
  });
  it("公開前の版は社長・GMと、作った本人（院長以上）だけ", () => {
    expect(canViewVersion(staff, v({ status: "draft", createdBy: "m1" }))).toBe(false);
    expect(canViewVersion(manager, v({ status: "draft", createdBy: "m1" }))).toBe(true);
    expect(canViewVersion(manager, v({ status: "draft", createdBy: "other" }))).toBe(false);
    expect(canViewVersion(gm, v({ status: "legal_hold" }))).toBe(true);
  });
});

describe("承認の操作", () => {
  it("GM確認はGM（または代理）、社長承認は社長だけ（代理不可）", () => {
    expect(canDo(gm, "gm_approve", v({ status: "gm_review" }))).toBe(true);
    expect(canDo(president, "gm_approve", v({ status: "gm_review" }))).toBe(false);
    expect(canDo({ ...bm, gmDelegations: ["g"] }, "gm_approve", v({ status: "gm_review" }))).toBe(true);
    expect(canDo({ ...bm, via: "pin", gmDelegations: ["g"] }, "gm_approve", v({ status: "gm_review" }))).toBe(false);
    expect(canDo(president, "president_approve", v({ status: "president_approval" }))).toBe(true);
    expect(canDo(gm, "president_approve", v({ status: "president_approval" }))).toBe(false);
  });
  it("状態を飛ばす操作はできない", () => {
    expect(canDo(president, "president_approve", v({ status: "gm_review" }))).toBe(false);
    expect(canDo(gm, "gm_approve", v({ status: "draft" }))).toBe(false);
  });
  it("確認済みは公開中かつ対象の人だけ", () => {
    expect(canAck(staff, v())).toBe(true);
    expect(canAck(staff, v({ status: "gm_review" }))).toBe(false);
    expect(canAck(staff, v({ targetPositions: ["manager"] }))).toBe(false);
  });
  it("管理者設定・社長GMの任命", () => {
    expect(canAdmin(actor({ isSystemAdmin: true }))).toBe(true);
    expect(canAdmin(actor({ isSystemAdmin: true, via: "pin" }))).toBe(false);
    expect(canAssignTop(actor({ isSystemAdmin: true }), false)).toBe(true);
    expect(canAssignTop(actor({ isSystemAdmin: true }), true)).toBe(false);
    expect(canAssignTop(gm, true)).toBe(false);
    expect(canAssignTop(president, true)).toBe(true);
  });
});

describe("ログインの印", () => {
  process.env.MANUAL_SESSION_SECRET = "x".repeat(40);
  it("署名・期限を確かめる", () => {
    const t = encodeSession({ m: "abc", via: "pin", k: "k", h: "h" }, 12, 1000);
    expect(decodeSession(t, 2000)?.m).toBe("abc");
    expect(decodeSession(t, 1000 + 13 * 3600 * 1000)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ m: "admin", via: "email", exp: 9e15 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`, 2000)).toBeNull();
    expect(decodeSession(`${body}.x${sig.slice(1)}`, 2000)).toBeNull();
  });
});

describe("検索の抜き出し", () => {
  it("語の前後を返す", () => {
    expect(snippetOf("あいうえお有給かきくけこ", ["有給"], 2)).toBe("…えお有給…");
  });
});
