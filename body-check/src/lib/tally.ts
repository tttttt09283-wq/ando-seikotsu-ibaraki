/**
 * ===== 利用数の自動集計（匿名） =====
 * 「何人がチェックを始めたか・最後までやったか・予約ボタンを押したか」を、院の管理画面で数えられるようにします。
 * 送るのは、匿名のセッションID・年齢・性別・気になる症状・結果（姿勢・体幹年齢・スコア）・どこから開いたか だけです。
 * 氏名・電話番号・メールなど、個人を特定できる情報は送りません。
 *
 * 保存先：あんど整骨院の予約システムのデータベース（Supabase）の body_check_results。
 * 書き込みは record_body_check() という決まった入口だけで、ほかの人の記録を読むことはできません（読めるのは院のスタッフだけ）。
 * デモ中は送りません。送れなくても、チェックの画面には影響しません。
 */
import { isDemo } from "./demo";
import type { BodyAgeResult } from "./bodyAge";
import type { CheckState } from "./storage";
import type { ScoreResult } from "@/types";

/** 公開してよい値（予約ページなどでも使っている、ブラウザから使う用の鍵）。書き込みは決まった入口だけに限定しています */
const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdGxpcnhjd2l0Y3VwYWV3aXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI1NTgsImV4cCI6MjA5Nzk2ODU1OH0.ym1WINmz3W7T2HWvtzWkQcKs96RB5JU1JZL7EiMz704";

export type TallyEvent = "start" | "complete" | "booking";

/** どこから開いたか（URLの ?src=line など）。英小文字・数字・_・- だけ、20文字まで */
export function readSource(search: string): string | null {
  try {
    const v = new URLSearchParams(search).get("src");
    if (!v) return null;
    const s = v.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20);
    return s || null;
  } catch {
    return null;
  }
}

/** LINEのアプリの中で開いているか */
export function isInLine(ua: string): boolean {
  return /\bLine\//i.test(ua);
}

/** 送る内容を作る（テストしやすいよう、送信とは分けています） */
export function buildTally(event: TallyEvent, state: CheckState, result?: ScoreResult | null, bodyAge?: BodyAgeResult | null, ua = "") {
  const body: Record<string, unknown> = {
    session_id: state.sessionId,
    event,
    source: state.source ?? "web",
    in_line: isInLine(ua),
    age: state.profile.age,
    sex: state.profile.sex,
    symptoms: state.profile.symptoms,
  };
  if (event === "complete") {
    body.body_age = bodyAge?.age ?? null;
    body.item_ages = bodyAge ? Object.fromEntries(bodyAge.items.map((i) => [i.id, i.age])) : null;
    body.total_score = result?.total ?? null;
    body.rank = result?.rank ?? null;
  }
  return body;
}

export async function sendTally(
  event: TallyEvent,
  state: CheckState,
  result?: ScoreResult | null,
  bodyAge?: BodyAgeResult | null,
): Promise<boolean> {
  if (typeof window === "undefined" || isDemo()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_body_check`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p: buildTally(event, state, result, bodyAge, navigator.userAgent || "") }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
