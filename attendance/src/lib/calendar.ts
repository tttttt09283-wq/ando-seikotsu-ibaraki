/**
 * 院の診療時間（曜日・祝日ごとの複数枠）の入力変換と検証。
 * day_of_week：0=日曜 … 6=土曜、7=祝日（DB の clinic_business_hours と同じ）
 */

export const DAY_KINDS = [1, 2, 3, 4, 5, 6, 0, 7] as const; // 表示順：月〜土、日、祝
export const DAY_KIND_LABELS: Record<number, string> = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土",
  7: "祝",
};
export const SLOTS_PER_DAY = 2;

export interface TimeSlot {
  open: string; // HH:mm
  close: string; // HH:mm
}

export interface WeeklySlot extends TimeSlot {
  day_of_week: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** フォームの欄名：d{曜日}_s{枠番号}_open / _close */
export const slotFieldName = (day: number, slot: number, edge: "open" | "close") => `d${day}_s${slot}_${edge}`;

/**
 * 1日分の枠を検証して開始時刻順に並べる。
 * 開始・終了の片方だけの入力、終了が開始以前、枠どうしの重なりはエラー。
 */
export function normalizeDaySlots(slots: Partial<TimeSlot>[], dayLabel: string): { ok: true; slots: TimeSlot[] } | { ok: false; message: string } {
  const filled: TimeSlot[] = [];
  for (const s of slots) {
    const open = s.open?.trim() ?? "";
    const close = s.close?.trim() ?? "";
    if (!open && !close) continue;
    if (!open || !close) return { ok: false, message: `${dayLabel}：開始と終了の両方を入力してください` };
    if (!TIME_PATTERN.test(open) || !TIME_PATTERN.test(close)) {
      return { ok: false, message: `${dayLabel}：時刻は HH:mm 形式で入力してください` };
    }
    if (close <= open) return { ok: false, message: `${dayLabel}：終了時刻は開始時刻より後にしてください` };
    filled.push({ open, close });
  }
  filled.sort((a, b) => a.open.localeCompare(b.open));
  for (let i = 1; i < filled.length; i++) {
    if (filled[i].open < filled[i - 1].close) return { ok: false, message: `${dayLabel}：診療枠が重なっています` };
  }
  return { ok: true, slots: filled };
}

/** 週間の診療時間フォームを DB 登録用の配列に変換する。枠の無い曜日は定休日 */
export function parseWeeklyHours(formData: FormData): { ok: true; slots: WeeklySlot[] } | { ok: false; message: string } {
  const result: WeeklySlot[] = [];
  for (const day of DAY_KINDS) {
    const raw = Array.from({ length: SLOTS_PER_DAY }, (_, i) => ({
      open: String(formData.get(slotFieldName(day, i + 1, "open")) ?? ""),
      close: String(formData.get(slotFieldName(day, i + 1, "close")) ?? ""),
    }));
    const normalized = normalizeDaySlots(raw, day === 7 ? "祝日" : `${DAY_KIND_LABELS[day]}曜`);
    if (!normalized.ok) return normalized;
    result.push(...normalized.slots.map((s) => ({ day_of_week: day, ...s })));
  }
  return { ok: true, slots: result };
}

/** "09:00:00" → "09:00" */
export const hhmm = (time: string) => time.slice(0, 5);

export function formatSlots(slots: TimeSlot[]): string {
  return slots.length === 0 ? "休診" : slots.map((s) => `${hhmm(s.open)}〜${hhmm(s.close)}`).join(" / ");
}
