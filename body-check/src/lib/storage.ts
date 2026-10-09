/**
 * ===== ブラウザ内保存（途中離脱への配慮） =====
 * 回答の途中経過を、利用者のスマホのブラウザ内（localStorage）だけに保存します。
 * サーバーには送りません。LINEを閉じてしまっても、続きから再開できます。
 *
 * localStorage = ブラウザに小さなデータを保存できる仕組み。
 * プライベートブラウズ等で使えない場合もあるので、失敗してもアプリが止まらないようにしています。
 */
import { AGE_GROUPS, CHECK_ORDER, SYMPTOMS } from "@/config/checks";
import type { Answers, CheckAnswer, Profile } from "@/types";

const STORAGE_KEY = "ando-body-check:v1";
/** この時間を過ぎた途中データは破棄（24時間） */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** 結果は7日間だけ見返せるようにする */
const RESULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Consent = "granted" | "denied" | null;

export interface CheckState {
  /** 統計用の匿名ID（個人を特定するものではありません） */
  sessionId: string;
  profile: Profile;
  answers: Answers;
  safetyAgreed: boolean;
  consent: Consent;
  /** 現在の画面番号（途中再開用） */
  step: number;
  completedAt: string | null;
  statsSent: boolean;
  bookingClicked: boolean;
  updatedAt: string;
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createInitialState(): CheckState {
  return {
    sessionId: newSessionId(),
    profile: { ageGroup: null, symptoms: [] },
    answers: {},
    safetyAgreed: false,
    consent: null,
    step: 0,
    completedAt: null,
    statsSent: false,
    bookingClicked: false,
    updatedAt: new Date().toISOString(),
  };
}

function isCheckAnswer(v: unknown): v is CheckAnswer<unknown> {
  if (!v || typeof v !== "object") return false;
  const s = (v as { status?: unknown }).status;
  return s === "skipped" || (s === "answered" && "value" in (v as object));
}

/** 保存データが壊れていたり古い形式だった場合に備えて、形をチェックする */
export function sanitizeState(raw: unknown, now: number = Date.now()): CheckState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CheckState>;
  if (typeof r.sessionId !== "string" || typeof r.updatedAt !== "string") return null;

  const updated = Date.parse(r.updatedAt);
  if (Number.isNaN(updated)) return null;
  const ttl = r.completedAt ? RESULT_TTL_MS : DRAFT_TTL_MS;
  if (now - updated > ttl) return null;

  const ageIds = AGE_GROUPS.map((a) => a.id) as string[];
  const symptomIds = SYMPTOMS.map((s) => s.id) as string[];
  const profile: Profile = {
    ageGroup: ageIds.includes(r.profile?.ageGroup as string) ? (r.profile!.ageGroup as Profile["ageGroup"]) : null,
    symptoms: Array.isArray(r.profile?.symptoms)
      ? (r.profile!.symptoms.filter((s) => symptomIds.includes(s)) as Profile["symptoms"])
      : [],
  };

  const answers: Answers = {};
  if (r.answers && typeof r.answers === "object") {
    for (const id of CHECK_ORDER) {
      const a = (r.answers as Record<string, unknown>)[id];
      if (isCheckAnswer(a)) (answers as Record<string, unknown>)[id] = a;
    }
  }

  return {
    sessionId: r.sessionId,
    profile,
    answers,
    safetyAgreed: r.safetyAgreed === true,
    consent: r.consent === "granted" || r.consent === "denied" ? r.consent : null,
    step: typeof r.step === "number" && Number.isInteger(r.step) && r.step >= 0 ? r.step : 0,
    completedAt: typeof r.completedAt === "string" ? r.completedAt : null,
    statsSent: r.statsSent === true,
    bookingClicked: r.bookingClicked === true,
    updatedAt: r.updatedAt,
  };
}

export function loadState(): CheckState | null {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const state = sanitizeState(JSON.parse(text));
    if (!state) window.localStorage.removeItem(STORAGE_KEY);
    return state;
  } catch {
    return null;
  }
}

export function saveState(state: CheckState): CheckState {
  const next = { ...state, updatedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、画面上のチェックはそのまま続けられます
  }
  return next;
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
}

/** 途中まで回答していて、まだ結果が出ていない状態か */
export function hasDraft(state: CheckState | null): boolean {
  return !!state && !state.completedAt && (state.step > 0 || state.profile.ageGroup !== null);
}
