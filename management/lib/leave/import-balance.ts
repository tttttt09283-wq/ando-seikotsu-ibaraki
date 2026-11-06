// 残数CSV（付与ごとに1行：Q-5）の検証。取り込みの前に、すべての行のエラー・注意を出す
import { parseDate, parseDays } from "../csv";
import { addMonths, addDays, endOfMonth } from "../dates";
import { leaveTypeFromLabel, LEAVE_SHORT_LABEL, type LeaveTypeCode } from "./types";

export const BALANCE_HEADERS = {
  required: ["スタッフID", "区分", "付与日", "有効期限", "残日数"],
  optional: ["氏名", "付与日数", "当期の取得済み日数"],
};
export const BALANCE_TEMPLATE = [
  "スタッフID,氏名,区分,付与日,付与日数,有効期限,残日数,当期の取得済み日数",
  "A001,田中 太郎,有給,2025/10/01,11,2027/09/30,6.5,",
  "A001,田中 太郎,有給,2026/10/01,12,2028/09/30,12,1",
  "A001,田中 太郎,振替,2026/11/01,,2026/11/30,1,",
  "A001,田中 太郎,祝振替,2026/11/03,,2026/11/30,1,",
].join("\r\n");

export type BalanceRowData = {
  staff_code: string; name: string; type_code: LeaveTypeCode; grant_date: string; expires_on: string;
  remaining: number; granted_days: number | null; counts_toward_5day: boolean; prior_taken: number;
};
export type ValidatedRow<T> = { rowNo: number; data: Partial<T>; errors: string[]; warnings: string[] };

export type BalanceContext = {
  today: string;
  staff: Map<string, { name: string }>;           // スタッフID → 氏名
  alreadyImported: Set<string>;                   // "スタッフID|区分|付与日"（取り込み済み・取消していないもの）
};

const isHalfStep = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
const normName = (s: string) => s.replace(/[\s　]/g, "");

export function validateBalanceRecords(headers: string[], records: { rowNo: number; values: Record<string, string> }[], ctx: BalanceContext) {
  const fileErrors: string[] = [];
  const missing = BALANCE_HEADERS.required.filter((h) => !headers.includes(h));
  if (missing.length) fileErrors.push(`見出しが足りません：${missing.join("・")}（1行目に見出しを入れてください）`);
  if (!records.length) fileErrors.push("データの行がありません");
  if (records.length > 2000) fileErrors.push("1回に取り込めるのは2000行までです");
  if (fileErrors.length) return { fileErrors, rows: [] as ValidatedRow<BalanceRowData>[] };

  const seen = new Map<string, number>();
  const rows = records.map(({ rowNo, values: v }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const d: Partial<BalanceRowData> = {};

    d.staff_code = v["スタッフID"];
    const staff = d.staff_code ? ctx.staff.get(d.staff_code) : undefined;
    if (!d.staff_code) errors.push("スタッフIDが空です");
    else if (!staff) errors.push(`スタッフID「${d.staff_code}」が登録されていません（先にスタッフを登録してください）`);
    d.name = staff?.name ?? v["氏名"] ?? "";
    if (staff && v["氏名"] && normName(v["氏名"]) !== normName(staff.name)) warnings.push(`氏名が登録と違います（登録：${staff.name}）`);

    const type = leaveTypeFromLabel(v["区分"] ?? "");
    if (!type) errors.push(`区分「${v["区分"] ?? ""}」が分かりません（有給・振替・祝振替）`);
    else if (type === "COMP") errors.push("代休は運用が未確定のため、まだ取り込めません（Q-11）");
    else d.type_code = type;

    const grant = parseDate(v["付与日"] ?? "");
    const exp = parseDate(v["有効期限"] ?? "");
    if (!grant) errors.push("付与日が日付になっていません（例：2026/04/01）");
    if (!exp) errors.push("有効期限が日付になっていません");
    if (grant && exp && exp < grant) errors.push("有効期限が付与日より前です");
    if (grant) d.grant_date = grant;
    if (exp) d.expires_on = exp;
    if (grant && grant > ctx.today) errors.push("付与日が未来の日付です");

    const remaining = parseDays(v["残日数"] ?? "");
    if (remaining === null) errors.push("残日数が数値になっていません");
    else if (!isHalfStep(remaining) || remaining > 40) errors.push("残日数は0〜40の0.5日刻みで入れてください");
    else d.remaining = remaining;

    const granted = v["付与日数"] ? parseDays(v["付与日数"]) : null;
    if (v["付与日数"] && (granted === null || !isHalfStep(granted) || granted <= 0 || granted > 40)) errors.push("付与日数が正しくありません");
    d.granted_days = granted;
    if (granted !== null && remaining !== null && remaining > granted) errors.push("残日数が付与日数より多くなっています");

    const prior = v["当期の取得済み日数"] ? parseDays(v["当期の取得済み日数"]) : 0;
    if (prior === null || (prior !== 0 && !isHalfStep(prior))) errors.push("当期の取得済み日数が正しくありません");
    d.prior_taken = prior ?? 0;

    if (d.type_code === "PAID") {
      d.counts_toward_5day = granted !== null && granted >= 10;
      if (granted === null) warnings.push("付与日数が空欄のため、年5日の対象かどうか判定できません（対象外として取り込みます）");
      if (grant && exp) {
        const legal = addDays(addMonths(grant, 24), -1);
        if (exp !== legal) warnings.push(`有効期限が、付与日から2年（${legal}）と違います`);
      }
      if (grant && granted !== null && granted >= 10 && addDays(addMonths(grant, 12), -1) < ctx.today && (d.prior_taken ?? 0) > 0) {
        warnings.push("当期の取得済み日数がありますが、この付与の年5日の期間はすでに終わっています");
      }
    } else {
      d.counts_toward_5day = false;
      if (d.prior_taken) errors.push("当期の取得済み日数は有給の行だけに入れてください");
      if (grant && exp && d.type_code && exp !== endOfMonth(grant)) warnings.push(`振休の期限は出勤した月の末日（${endOfMonth(grant)}）が原則です`);
    }
    if (exp && exp < ctx.today && (remaining ?? 0) > 0) {
      warnings.push(d.type_code === "PAID" ? "有効期限を過ぎています（取り込むと失効として扱います）" : "期限を過ぎています（期限切れの振休としてアラートが出ます）");
    }

    if (d.staff_code && d.type_code && d.grant_date) {
      const key = `${d.staff_code}|${d.type_code}|${d.grant_date}`;
      if (seen.has(key)) errors.push(`${seen.get(key)}行目と同じ人・区分・付与日です`);
      else seen.set(key, rowNo);
      if (ctx.alreadyImported.has(key)) errors.push("この人・区分・付与日の残数はすでに取り込み済みです");
    }
    return { rowNo, data: d, errors, warnings };
  });
  return { fileErrors, rows };
}

// 取り込み内容の確認用（区分ごとの件数と日数）
export function summarizeBalance(rows: ValidatedRow<BalanceRowData>[]) {
  const out = new Map<string, { label: string; rows: number; days: number; people: Set<string> }>();
  for (const r of rows) {
    if (!r.data.type_code) continue;
    const k = r.data.type_code;
    const cur = out.get(k) ?? { label: LEAVE_SHORT_LABEL[k], rows: 0, days: 0, people: new Set<string>() };
    cur.rows++;
    cur.days += r.data.remaining ?? 0;
    if (r.data.staff_code) cur.people.add(r.data.staff_code);
    out.set(k, cur);
  }
  return [...out.values()].map((x) => ({ label: x.label, rows: x.rows, days: x.days, people: x.people.size }));
}
