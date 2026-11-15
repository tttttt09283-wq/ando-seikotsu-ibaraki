// 権限の判定はすべてここで行う（画面のボタン表示もサーバーの処理も同じ関数を使う）。
// 画面でボタンを隠すだけでなく、サーバーの処理は必ず先にここで確認する。

import { CLINIC_IDS, COMPANY_WIDE, PRIVILEGED, type Kind, type Position, type Status } from "./config";

export type Assignment = { clinicId: string | null; position: Position; isPrimary: boolean };

export type Actor = {
  memberId: string;
  name: string;
  via: "email" | "pin" | "dev";
  isSystemAdmin: boolean; // clinic_staff.role = 'admin'（メールアドレスでログインしたときだけ有効）
  assignments: Assignment[]; // 今日有効な所属（兼務は複数）
  areaClinics: string[]; // 担当エリア（BM・GM）
  gmDelegations: string[]; // GM確認を代理している相手（今日有効なもの）
};

export type VersionInfo = {
  status: Status;
  kind: Kind;
  createdBy: string | null;
  targetPositions: string[];
  targetClinics: string[];
};

// 院ID＋個人PASSでのログインでは、承認・編集の力（社長・GM・BM・院長）は使えない
export function effectivePositions(a: Actor): Position[] {
  const all = a.assignments.map((x) => x.position);
  if (a.via !== "pin") return [...new Set(all)];
  const kept = all.filter((p) => !PRIVILEGED.includes(p));
  return [...new Set(kept.length ? kept : all.length ? (["staff"] as Position[]) : [])];
}

export const has = (a: Actor, ...ps: Position[]) => effectivePositions(a).some((p) => ps.includes(p));
export const isPresident = (a: Actor) => has(a, "president");
export const isGm = (a: Actor) => has(a, "gm");
export const isTop = (a: Actor) => has(a, "president", "gm");
// 権限は弱いが、メールでログインすれば使える役職を持っている（画面で「メールでログインを」と案内する）
export const hasDormantPrivilege = (a: Actor) => a.via === "pin" && a.assignments.some((x) => PRIVILEGED.includes(x.position));

export function memberClinics(a: Actor): string[] {
  if (a.assignments.some((x) => x.clinicId === null && COMPANY_WIDE.includes(x.position))) return [...CLINIC_IDS];
  return [...new Set(a.assignments.map((x) => x.clinicId).filter((x): x is string => !!x))];
}

// 見られる院（社長・GM＝全院、BM＝担当エリア＋所属、それ以外＝所属）
export function visibleClinics(a: Actor): string[] {
  if (isTop(a)) return [...CLINIC_IDS];
  const own = memberClinics(a);
  return has(a, "bm") ? [...new Set([...own, ...a.areaClinics])] : own;
}

// その版の「対象」か（確認が必要な人か）。対象役職・対象院が空なら全員・全院
export function isTargeted(a: Actor, v: Pick<VersionInfo, "targetPositions" | "targetClinics">): boolean {
  const positions = a.assignments.map((x) => x.position);
  if (!positions.length) return false;
  const posOk = !v.targetPositions.length || positions.some((p) => v.targetPositions.includes(p));
  if (!posOk) return false;
  if (!v.targetClinics.length) return true;
  return memberClinics(a).some((c) => v.targetClinics.includes(c));
}

const MANAGER_UP: Position[] = ["president", "gm", "bm", "manager"];

export function canViewVersion(a: Actor, v: VersionInfo): boolean {
  if (v.status === "published" || v.status === "superseded" || v.status === "archived") {
    if (v.kind === "manager_manual") return has(a, ...MANAGER_UP);
    if (has(a, "president", "gm", "bm")) return true;
    return isTargeted(a, v);
  }
  // 公開前の版：社長・GM（代理含む）と、作った本人
  if (isTop(a) || (a.via !== "pin" && a.gmDelegations.length > 0)) return true;
  return !!v.createdBy && v.createdBy === a.memberId && has(a, ...MANAGER_UP);
}

export const canViewManagerManual = (a: Actor) => has(a, ...MANAGER_UP);
export const canPropose = (a: Actor) => has(a, ...MANAGER_UP);
export const canSeeReviewQueue = (a: Actor) => isTop(a) || gmReviewAuthority(a).ok || canPropose(a);

export function canEditVersion(a: Actor, v: VersionInfo): boolean {
  if (v.status !== "draft" && v.status !== "returned") return false;
  if (isTop(a)) return true;
  return canPropose(a) && v.createdBy === a.memberId;
}
export const canSubmit = canEditVersion;

// 新しい版（改訂）を作れるのは社長・GM
export const canRevise = (a: Actor) => isTop(a);

// GM確認：GM本人、または今日有効な代理
export function gmReviewAuthority(a: Actor): { ok: boolean; viaDelegationOf: string | null } {
  if (isGm(a)) return { ok: true, viaDelegationOf: null };
  if (a.via !== "pin" && a.gmDelegations.length) return { ok: true, viaDelegationOf: a.gmDelegations[0] };
  return { ok: false, viaDelegationOf: null };
}

export type ReviewAction = "submit" | "gm_approve" | "president_approve" | "return" | "legal_hold" | "legal_clear" | "archive";

// 状態の流れ：下書き → GM確認 → 社長承認 → 公開。どこからでも 差し戻し・法令確認待ち へ
export const TRANSITIONS: Record<ReviewAction, { from: Status[]; to: Status }> = {
  submit: { from: ["draft", "returned"], to: "gm_review" },
  gm_approve: { from: ["gm_review"], to: "president_approval" },
  president_approve: { from: ["president_approval"], to: "published" },
  return: { from: ["gm_review", "president_approval", "legal_hold"], to: "returned" },
  legal_hold: { from: ["draft", "returned", "gm_review", "president_approval"], to: "legal_hold" },
  legal_clear: { from: ["legal_hold"], to: "gm_review" },
  archive: { from: ["published"], to: "archived" },
};

export function canDo(a: Actor, action: ReviewAction, v: VersionInfo): boolean {
  if (!TRANSITIONS[action].from.includes(v.status)) return false;
  switch (action) {
    case "submit":
      return canSubmit(a, v);
    case "gm_approve":
      return gmReviewAuthority(a).ok;
    case "president_approve":
      return isPresident(a); // 社長承認は代理できない
    case "return":
      if (v.status === "gm_review") return gmReviewAuthority(a).ok || isPresident(a);
      if (v.status === "president_approval") return isPresident(a);
      return isTop(a);
    case "legal_hold":
    case "legal_clear":
      return isTop(a);
    case "archive":
      return isPresident(a);
  }
}

export const canAck = (a: Actor, v: VersionInfo) => v.status === "published" && isTargeted(a, v);

// 管理者設定（スタッフ・所属・取り込み・監査ログ）：社長・GM、または予約管理の管理者（メールでログイン）
export const canAdmin = (a: Actor) => isTop(a) || (a.via !== "pin" && a.isSystemAdmin);
export const canViewAudit = canAdmin;
export const canManageConflicts = isTop;

// 社長・GM の任命：社長だけ。まだ社長が登録されていないときだけ、管理者が最初の設定をできる
export const canAssignTop = (a: Actor, presidentExists: boolean) => isPresident(a) || (!presidentExists && canAdmin(a));
