// スタッフ・所属・担当エリア・代理承認
import type postgres from "postgres";
import type { Actor, Assignment } from "../authz";
import { canAssignTop } from "../authz";
import { COMPANY_WIDE, POSITIONS, type Position } from "../config";

type Q = postgres.Sql | postgres.TransactionSql;

export type MemberRow = {
  id: string;
  person_key: string | null;
  clinic_staff_id: number | null;
  auth_uid: string | null;
  name: string;
  employment_type: string;
  joined_on: string | null;
  retired_on: string | null;
  is_active: boolean;
  is_system_admin: boolean;
};

const ACTIVE_ON_TODAY = (q: Q) => q`valid_from <= mn_today() and (valid_to is null or valid_to >= mn_today())`;

export async function loadActor(q: Q, memberId: string, via: Actor["via"]): Promise<Actor | null> {
  const [m] = await q<MemberRow[]>`
    select * from mn_members where id = ${memberId} and is_active and (retired_on is null or retired_on >= mn_today())`;
  if (!m) return null;
  const asg = await q<{ clinic_id: string | null; position: Position; is_primary: boolean }[]>`
    select clinic_id, position, is_primary from mn_assignments where member_id = ${memberId} and ${ACTIVE_ON_TODAY(q)}
    order by is_primary desc, valid_from`;
  const isSystemAdmin = m.is_system_admin && via !== "pin";
  if (!asg.length && !isSystemAdmin) return null;
  const areas = await q<{ clinic_id: string }[]>`select clinic_id from mn_areas where member_id = ${memberId} and ${ACTIVE_ON_TODAY(q)}`;
  const dels = await q<{ from_member: string }[]>`
    select d.from_member from mn_delegations d
    where d.to_member = ${memberId} and d.permission = 'gm_review' and d.valid_from <= mn_today() and d.valid_to >= mn_today()
      and exists (select 1 from mn_assignments a where a.member_id = d.from_member and a.position = 'gm' and ${ACTIVE_ON_TODAY(q)})`;
  return {
    memberId: m.id,
    name: m.name,
    via,
    isSystemAdmin: m.is_system_admin,
    assignments: asg.map((a) => ({ clinicId: a.clinic_id, position: a.position, isPrimary: a.is_primary })),
    areaClinics: [...new Set(areas.map((a) => a.clinic_id))],
    gmDelegations: dels.map((d) => d.from_member),
  };
}

// メールアドレスでログインした人を mn_members と結びつける
export async function linkEmailMember(
  q: Q,
  uid: string,
  staff: { id: number; name: string; role: string } | null,
  personKey: string | null,
): Promise<MemberRow | null> {
  if (!staff) return null;
  const isAdmin = staff.role === "admin";
  let [m] = await q<MemberRow[]>`select * from mn_members where clinic_staff_id = ${staff.id} or auth_uid = ${uid} limit 1`;
  if (!m && personKey) {
    const hits = await q<MemberRow[]>`select * from mn_members where person_key = ${personKey} and clinic_staff_id is null and auth_uid is null`;
    if (hits.length === 1) m = hits[0];
  }
  if (!m) {
    if (!isAdmin) return null; // 一般のアカウントは管理者が登録してから
    [m] = await q<MemberRow[]>`
      insert into mn_members (name, person_key, clinic_staff_id, auth_uid, is_system_admin)
      values (${staff.name}, ${personKey}, ${staff.id}, ${uid}, true) returning *`;
    return m;
  }
  if (m.clinic_staff_id !== staff.id || m.auth_uid !== uid || m.is_system_admin !== isAdmin) {
    [m] = await q<MemberRow[]>`
      update mn_members set clinic_staff_id = ${staff.id}, auth_uid = ${uid}, is_system_admin = ${isAdmin} where id = ${m.id} returning *`;
  }
  return m;
}

export async function memberByPersonKey(q: Q, key: string): Promise<MemberRow | null> {
  const [m] = await q<MemberRow[]>`select * from mn_members where person_key = ${key}`;
  return m ?? null;
}

// ===== 管理者設定 =====
export type MemberListRow = MemberRow & {
  assignments: { id: string; clinic_id: string | null; position: Position; is_primary: boolean; valid_from: string; valid_to: string | null }[];
  areas: { id: string; clinic_id: string; valid_from: string; valid_to: string | null }[];
};

export async function listMembers(q: Q): Promise<MemberListRow[]> {
  const ms = await q<MemberRow[]>`select * from mn_members order by is_active desc, name`;
  const asg = await q`select id, member_id, clinic_id, position, is_primary, valid_from::text, valid_to::text from mn_assignments order by valid_from desc`;
  const areas = await q`select id, member_id, clinic_id, valid_from::text, valid_to::text from mn_areas order by valid_from desc`;
  return ms.map((m) => ({
    ...m,
    assignments: asg.filter((a) => a.member_id === m.id) as unknown as MemberListRow["assignments"],
    areas: areas.filter((a) => a.member_id === m.id) as unknown as MemberListRow["areas"],
  }));
}

export async function presidentExists(q: Q): Promise<boolean> {
  const [r] = await q`select exists (select 1 from mn_assignments where position = 'president' and valid_from <= mn_today() and (valid_to is null or valid_to >= mn_today())) as x`;
  return !!r.x;
}

export class RuleError extends Error {}
const no = (m: string): never => { throw new RuleError(m); };

export async function addAssignment(
  q: Q,
  actor: Actor,
  input: { memberId: string; position: Position; clinicId: string | null; isPrimary: boolean; validFrom: string },
) {
  if (!POSITIONS.includes(input.position)) no("役職が正しくありません");
  const top = COMPANY_WIDE.includes(input.position);
  if (top && !canAssignTop(actor, await presidentExists(q))) no("社長・GMの任命は社長だけができます");
  const clinicId = top ? null : input.clinicId;
  if (!top && !clinicId) no("院を選んでください");
  const [m] = await q<MemberRow[]>`select * from mn_members where id = ${input.memberId} and is_active`;
  if (!m) no("在籍中のスタッフではありません");
  if (input.isPrimary) {
    // 主所属は1つ：これまでの主所属は「兼務」扱いにする
    await q`update mn_assignments set is_primary = false where member_id = ${input.memberId} and is_primary and (valid_to is null or valid_to >= ${input.validFrom})`;
  }
  await q`insert into mn_assignments (member_id, clinic_id, position, is_primary, valid_from)
          values (${input.memberId}, ${clinicId}, ${input.position}, ${input.isPrimary}, ${input.validFrom})`;
}

// 所属の終了（異動・役職変更は「終了」＋「追加」）
export async function endAssignment(q: Q, actor: Actor, assignmentId: string, validTo: string) {
  const [a] = await q<{ position: Position; valid_from: string }[]>`select position, valid_from::text from mn_assignments where id = ${assignmentId}`;
  if (!a) no("所属が見つかりません");
  if (COMPANY_WIDE.includes(a.position) && !canAssignTop(actor, true)) no("社長・GMの所属の変更は社長だけができます");
  if (validTo < a.valid_from) no("終了日が開始日より前です");
  await q`update mn_assignments set valid_to = ${validTo} where id = ${assignmentId}`;
}

export async function setArea(q: Q, input: { memberId: string; clinicId: string; validFrom: string }) {
  const [ok] = await q`select 1 from mn_assignments where member_id = ${input.memberId} and position in ('bm', 'gm')
    and (valid_to is null or valid_to >= ${input.validFrom})`;
  if (!ok) no("担当エリアを持てるのは BM・GM だけです");
  // その院の担当は1人：今の担当を前日で終了
  await q`update mn_areas set valid_to = (${input.validFrom}::date - 1)
          where clinic_id = ${input.clinicId} and (valid_to is null or valid_to >= ${input.validFrom}) and valid_from < ${input.validFrom}`;
  await q`delete from mn_areas where clinic_id = ${input.clinicId} and valid_from >= ${input.validFrom}`;
  await q`insert into mn_areas (member_id, clinic_id, valid_from) values (${input.memberId}, ${input.clinicId}, ${input.validFrom})`;
}

export async function endArea(q: Q, areaId: string, validTo: string) {
  await q`update mn_areas set valid_to = ${validTo} where id = ${areaId}`;
}

export async function addDelegation(q: Q, actor: Actor, input: { fromMember: string; toMember: string; validFrom: string; validTo: string; reason: string }) {
  const [gm] = await q`select 1 from mn_assignments where member_id = ${input.fromMember} and position = 'gm' and (valid_to is null or valid_to >= ${input.validFrom})`;
  if (!gm) no("代理を立てられるのは GM の確認だけです");
  if (actor.memberId !== input.fromMember && !actor.assignments.some((a) => a.position === "president")) no("代理は GM 本人か社長が設定します");
  await q`insert into mn_delegations (from_member, to_member, permission, valid_from, valid_to, reason)
          values (${input.fromMember}, ${input.toMember}, 'gm_review', ${input.validFrom}, ${input.validTo}, ${input.reason})`;
}

// 退職：その日まで在籍。翌日からログインできない（今日以前なら即時）。記録は消さない
export async function retireMember(q: Q, memberId: string, retiredOn: string) {
  const [m] = await q<MemberRow[]>`update mn_members set retired_on = ${retiredOn},
      is_active = (${retiredOn}::date >= mn_today()) where id = ${memberId} returning *`;
  if (!m) no("スタッフが見つかりません");
  // 退職日より後に始まる予定だった所属は取り消し（監査ログには残る）、それ以外は退職日で終了
  for (const t of ["mn_assignments", "mn_areas"] as const) {
    await q`delete from ${q(t)} where member_id = ${memberId} and valid_from > ${retiredOn}`;
    await q`update ${q(t)} set valid_to = ${retiredOn} where member_id = ${memberId} and (valid_to is null or valid_to > ${retiredOn})`;
  }
  await q`delete from mn_delegations where (from_member = ${memberId} or to_member = ${memberId}) and valid_from > ${retiredOn}`;
  await q`update mn_delegations set valid_to = ${retiredOn} where (from_member = ${memberId} or to_member = ${memberId}) and valid_to > ${retiredOn}`;
  return m;
}

export async function addMember(q: Q, input: { name: string; personKey: string | null; employmentType: "regular" | "part_time"; joinedOn: string | null }) {
  const [m] = await q<MemberRow[]>`insert into mn_members (name, person_key, employment_type, joined_on)
    values (${input.name}, ${input.personKey}, ${input.employmentType}, ${input.joinedOn}) returning *`;
  return m;
}

// 台帳（スタッフ一覧）から取り込む。新しい人だけ追加し、所属のない人には台帳の院・役職で所属を作る。
// 台帳にいない在籍者は「確認が必要」として返す（退職かどうかは管理者が判断する）
export function positionFromLedgerRole(role: string): Position {
  const r = role || "";
  if (r.includes("副院長")) return "sub_manager";
  if (r.includes("院長")) return "manager";
  if (r.includes("チーフ")) return "chief";
  return "staff";
}

export async function syncFromLedger(
  q: Q,
  people: { key: string; name: string; clinics: string[]; role: string; grade: string }[],
  clinicIdOf: (ledgerName: string) => string | null,
) {
  const added: string[] = [];
  const assigned: string[] = [];
  for (const p of people) {
    if (!p.key || p.grade === "G6") continue; // GM は管理者が任命する
    let m = await memberByPersonKey(q, p.key);
    if (!m) {
      m = await addMember(q, { name: p.name, personKey: p.key, employmentType: "regular", joinedOn: null });
      added.push(p.name);
    }
    const [has] = await q`select 1 from mn_assignments where member_id = ${m.id} limit 1`;
    if (has) continue;
    const clinics = p.clinics.map(clinicIdOf).filter((x): x is string => !!x);
    for (const [i, c] of clinics.entries()) {
      await q`insert into mn_assignments (member_id, clinic_id, position, is_primary) values (${m.id}, ${c}, ${positionFromLedgerRole(p.role)}, ${i === 0})`;
    }
    if (clinics.length) assigned.push(p.name);
  }
  const keys = new Set(people.map((p) => p.key));
  const notInLedger = (await q<MemberRow[]>`select * from mn_members where is_active and person_key is not null`)
    .filter((m) => !keys.has(m.person_key!))
    .map((m) => m.name);
  return { added, assigned, notInLedger };
}

export type { Assignment };
