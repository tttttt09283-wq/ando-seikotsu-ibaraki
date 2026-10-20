/**
 * 休日管理の区分（スタッフ・日ごと）。表記は現在の勤怠管理表（Excel）の出勤区分に合わせている。
 * DB の staff_day_records.code と同じ値。
 */
export type DayCode =
  | "legal_holiday"
  | "non_legal_holiday"
  | "half_non_legal"
  | "holiday_work"
  | "half_work"
  | "pay_conversion"
  | "paid"
  | "paid_half"
  | "planned_paid"
  | "furikyu"
  | "furikyu_half"
  | "daikyu"
  | "daikyu_half"
  | "special_paid"
  | "special_unpaid"
  | "absence"
  | "suspension"
  | "other_leave"
  | "other"
  | "late"
  | "early";

export type DayCodeGroup = "holiday" | "work" | "leave" | "other";

export const DAY_CODES: { code: DayCode; label: string; group: DayCodeGroup; description: string }[] = [
  { code: "legal_holiday", label: "法定内", group: "holiday", description: "法定休日（週1日の休日）。この日の勤務は法定休日労働" },
  { code: "non_legal_holiday", label: "法定外", group: "holiday", description: "法定外休日（所定休日）" },
  { code: "half_non_legal", label: "半法定外", group: "holiday", description: "半日の法定外休日" },
  { code: "holiday_work", label: "休出", group: "work", description: "休日出勤（代休の対象）" },
  { code: "half_work", label: "半出勤", group: "work", description: "休日の半日出勤" },
  { code: "pay_conversion", label: "給与変換", group: "work", description: "休日出勤を代休にせず給与で支払う（代休の対象外）" },
  { code: "paid", label: "有休", group: "leave", description: "年次有給休暇（全日）" },
  { code: "paid_half", label: "半休", group: "leave", description: "年次有給休暇（半日）" },
  { code: "planned_paid", label: "計画年休", group: "leave", description: "計画的付与の年次有給休暇" },
  { code: "furikyu", label: "振休", group: "leave", description: "振休（祝日勤務の分）" },
  { code: "furikyu_half", label: "振半休", group: "leave", description: "振休（半日）" },
  { code: "daikyu", label: "代休", group: "leave", description: "代休（休日出勤の分）" },
  { code: "daikyu_half", label: "代半休", group: "leave", description: "代休（半日）" },
  { code: "special_paid", label: "特休(有)", group: "leave", description: "特別休暇（有給）" },
  { code: "special_unpaid", label: "特休(無)", group: "leave", description: "特別休暇（無給）" },
  { code: "absence", label: "欠勤", group: "other", description: "欠勤" },
  { code: "suspension", label: "休業", group: "other", description: "休業" },
  { code: "other_leave", label: "その他休暇", group: "leave", description: "その他の休暇" },
  { code: "other", label: "その他", group: "other", description: "その他" },
  { code: "late", label: "遅刻", group: "other", description: "遅刻" },
  { code: "early", label: "早退", group: "other", description: "早退" },
];

export const DAY_CODE_LABELS = Object.fromEntries(DAY_CODES.map((c) => [c.code, c.label])) as Record<DayCode, string>;
export const isDayCode = (v: string): v is DayCode => DAY_CODES.some((c) => c.code === v);

const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")");

const BY_LABEL = new Map<string, DayCode>([
  ...DAY_CODES.map((c) => [normalize(c.label), c.code] as const),
  ["法定休日", "legal_holiday"],
  ["法定外休日", "non_legal_holiday"],
  ["有給", "paid"],
  ["有給休暇", "paid"],
  ["年休", "paid"],
  ["半日有休", "paid_half"],
  ["振替休日", "furikyu"],
  ["休日出勤", "holiday_work"],
  ["特休", "special_paid"],
]);

/** 管理表の表記（「法定内」「特休（有）」など）を区分に。該当しなければ null */
export function codeFromLabel(label: string): DayCode | null {
  return BY_LABEL.get(normalize(label)) ?? null;
}

/** 表示の色（区分のグループごと） */
export const DAY_CODE_TONE: Record<DayCodeGroup, string> = {
  holiday: "bg-slate-100 text-slate-700",
  work: "bg-rose-50 text-rose-700",
  leave: "bg-emerald-50 text-emerald-700",
  other: "bg-amber-50 text-amber-800",
};
export const groupOf = (code: DayCode) => DAY_CODES.find((c) => c.code === code)?.group ?? "other";
