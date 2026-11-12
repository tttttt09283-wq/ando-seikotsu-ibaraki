/**
 * ===== 利用数の自動集計（匿名） =====
 * 「何人がチェックを始めたか・最後までやったか・予約ボタンを押したか」を、院の管理画面で数えられるようにします。
 * 送るのは、匿名のセッションID・お名前（任意のニックネーム）・年齢・性別・気になる症状・結果（姿勢・体幹年齢・スコア）・
 * どこから開いたか・紹介コード（シェアのURL用）・シェアしてくれた人の紹介コード だけです。
 * 電話番号・メール・LINEのアカウント情報は送りません。
 *
 * 保存先：あんど整骨院の予約システムのデータベース（Supabase）の body_check_results。
 * 書き込みは record_body_check() という決まった入口だけで、ほかの人の記録を読むことはできません（読めるのは院のスタッフだけ）。
 * デモ中は送りません。送れなくても、チェックの画面には影響しません。
 */
import { isDemo } from "./demo";
import type { BodyAgeResult } from "./bodyAge";
import { shareCodeOf, type CheckState } from "./storage";
import { siteConfig } from "@/config/site";
import type { ScoreResult } from "@/types";

/** 公開してよい値（予約ページなどでも使っている、ブラウザから使う用の鍵）。書き込みは決まった入口だけに限定しています */
const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdGxpcnhjd2l0Y3VwYWV3aXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI1NTgsImV4cCI6MjA5Nzk2ODU1OH0.ym1WINmz3W7T2HWvtzWkQcKs96RB5JU1JZL7EiMz704";

export type TallyEvent = "start" | "complete" | "booking" | "share";

/** 紹介コード（?ref=…）を読み取る。英小文字・数字の6〜16文字だけ */
export function readRef(search: string): string | null {
  try {
    const v = (new URLSearchParams(search).get("ref") || "").toLowerCase();
    return /^[a-z0-9]{6,16}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** 結果をシェアするURL（友達・家族はこのURLから始める）。LIFFを設定していればLINEで開くURLにする */
export function shareUrlFor(code: string): string {
  if (siteConfig.liffId) return `https://liff.line.me/${siteConfig.liffId}?ref=${code}`;
  return `${siteConfig.siteUrl}/s?ref=${code}`;
}

/** シェアした人のニックネームと姿勢・体幹年齢（シェアされたページに出す）。見つからなければ null */
export async function fetchSharedResult(code: string): Promise<{ nickname: string | null; body_age: number | null } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_shared_body_check`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

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

/** URLに ?src= が無いとき、InstagramやThreadsのアプリの中で開いていれば、それを「どこから」にする */
export function appSourceFromUa(ua: string): string | null {
  if (/\bInstagram\b/i.test(ua)) return "instagram";
  if (/\bBarcelona\b/i.test(ua)) return "threads"; // ThreadsアプリのブラウザはこのUAになる
  return null;
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
    source: state.source ?? (state.ref ? "share" : "web"),
    in_line: isInLine(ua),
    nickname: state.profile.nickname ?? null,
    share_code: shareCodeOf(state.sessionId),
    referred_by: state.ref,
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

// ===== URLを開いた回数（匿名） =====
// チェックのページ（/check。/age・/qr・/th・/ig から来た場合も）と、シェアされたページ（/s）を開くたびに1件送る。
// 「開いた人数」を数えるため、端末ごとの匿名ID（この端末のブラウザにだけ保存）を付ける。個人情報は送らない。
export type ViewPage = "check" | "share";
const VISITOR_KEY = "ando-bodycheck-visitor";

/** 端末ごとの匿名ID（無ければ作って保存する。保存できない端末では毎回新しいID） */
export function visitorId(storage: Pick<Storage, "getItem" | "setItem"> | null): string {
  try {
    const v = storage?.getItem(VISITOR_KEY);
    if (v && /^[A-Za-z0-9-]{8,64}$/.test(v)) return v;
  } catch {
    /* 保存できない端末 */
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    storage?.setItem(VISITOR_KEY, id);
  } catch {
    /* 保存できない端末 */
  }
  return id;
}

/** 送る内容を作る（テストしやすいよう、送信とは分けています） */
export function buildView(page: ViewPage, visitor: string, search: string, ua = "") {
  const ref = readRef(search);
  return {
    visitor_id: visitor,
    page,
    source: readSource(search) ?? appSourceFromUa(ua) ?? (ref ? "share" : "web"),
    in_line: isInLine(ua),
  };
}

export async function sendView(page: ViewPage): Promise<boolean> {
  if (typeof window === "undefined" || isDemo()) return false;
  try {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    const body = buildView(page, visitorId(storage), window.location.search, navigator.userAgent || "");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_body_check_view`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p: body }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
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
