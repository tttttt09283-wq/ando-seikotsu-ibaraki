/**
 * 予約枠の計算と重複判定（純粋関数）。
 * 同じロジックを DB 関数 create_reservation_hold() でも実装している（supabase/migrations）。
 *
 * 占有範囲の考え方（施術者は1人＝岩永）:
 *   - 予約は [開始, 終了) を施術、終了後にその拠点の buffer_minutes（片付け・準備）を占有する。
 *   - 別拠点の予約との間には、さらに移動時間 max(拠点Aの移動時間, 拠点Bの移動時間) を空ける。
 *   - 拠点を問わず、同じ施術者の時間帯が重なる予約は作れない（別拠点間の重複予約を禁止）。
 */
import { ACTIVE_STATUSES, type AvailabilityRule, type BlockedSlot, type Location, type Reservation } from "./types";
import { addMinutes, jstDateKey, jstDateTime, jstWeekday, overlaps, timeToMinutes } from "../time";

export interface OccupiedRange {
  reservationId?: string;
  locationId: string;
  start: number; // ms
  end: number; // 施術終了 ms
}

/** そのホールドは今も有効か（期限切れのホールドは枠を占有しない） */
export function isOccupying(r: Pick<Reservation, "status" | "hold_expires_at">, now: Date): boolean {
  if (!ACTIVE_STATUSES.includes(r.status)) return false;
  if (r.status === "confirmed") return true;
  if (!r.hold_expires_at) return true;
  return new Date(r.hold_expires_at).getTime() > now.getTime();
}

/** 2つの予約の間に必要な空き時間（分） */
export function requiredGapMinutes(before: Location, after: Location): number {
  if (before.id === after.id) return before.buffer_minutes;
  return before.buffer_minutes + Math.max(before.travel_minutes, after.travel_minutes);
}

/**
 * 候補 [start,end) at loc が既存の占有と衝突するか。
 * before→candidate、candidate→after の双方向で必要な空きを確認する。
 */
export function conflictsWithReservations(
  candidate: { locationId: string; start: number; end: number; excludeId?: string },
  existing: OccupiedRange[],
  locations: Map<string, Location>,
): boolean {
  const cLoc = locations.get(candidate.locationId);
  if (!cLoc) return true;
  for (const e of existing) {
    if (candidate.excludeId && e.reservationId === candidate.excludeId) continue;
    const eLoc = locations.get(e.locationId);
    if (!eLoc) return true;
    // 既存が前：既存終了 + gap(既存→候補) <= 候補開始 でなければ衝突
    const gapAfterExisting = requiredGapMinutes(eLoc, cLoc) * 60_000;
    // 候補が前：候補終了 + gap(候補→既存) <= 既存開始 でなければ衝突
    const gapAfterCandidate = requiredGapMinutes(cLoc, eLoc) * 60_000;
    if (overlaps(candidate.start, candidate.end + gapAfterCandidate, e.start, e.end + gapAfterExisting)) return true;
  }
  return false;
}

export function conflictsWithBlocks(
  candidate: { locationId: string; start: number; end: number },
  blocks: BlockedSlot[],
  bufferMinutes: number,
): boolean {
  const end = candidate.end + bufferMinutes * 60_000;
  return blocks.some(
    (b) =>
      (b.location_id === null || b.location_id === candidate.locationId) &&
      overlaps(candidate.start, end, new Date(b.start_at).getTime(), new Date(b.end_at).getTime()),
  );
}

/** その日の営業時間帯（JST の "HH:MM" 範囲）。指定日のルールが曜日ルールより優先 */
export function windowsForDate(date: string, rules: AvailabilityRule[]): Array<{ start: string; end: string }> {
  const specific = rules.filter((r) => r.specific_date === date);
  const applicable = specific.length > 0 ? specific : rules.filter((r) => r.specific_date === null && r.weekday === jstWeekday(date));
  if (applicable.some((r) => r.is_closed)) return [];
  return applicable
    .filter((r) => r.start_time && r.end_time && timeToMinutes(r.start_time) < timeToMinutes(r.end_time))
    .map((r) => ({ start: r.start_time as string, end: r.end_time as string }))
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

export interface SlotContext {
  location: Location;
  locations: Map<string, Location>;
  rules: AvailabilityRule[];
  blocks: BlockedSlot[];
  /** 施術者の全拠点の予約（拠点をまたいで重複を判定するため） */
  reservations: Array<Pick<Reservation, "id" | "location_id" | "status" | "hold_expires_at" | "start_at" | "end_at">>;
  now: Date;
}

export type SlotRejectReason =
  | "outside_hours"
  | "deadline"
  | "too_far"
  | "blocked"
  | "conflict"
  | "daily_limit"
  | "past";

/** 1枠ぶんの判定。予約作成時（サーバー側）にも必ず呼ぶ */
export function checkSlot(ctx: SlotContext, start: Date, durationMinutes: number, excludeId?: string): SlotRejectReason | null {
  const { location, now } = ctx;
  const s = start.getTime();
  const e = addMinutes(start, durationMinutes).getTime();
  if (s <= now.getTime()) return "past";
  if (s - now.getTime() < location.booking_deadline_hours * 3_600_000) return "deadline";
  const date = jstDateKey(start);
  const lastDay = jstDateKey(addMinutes(now, location.max_advance_days * 24 * 60));
  if (date > lastDay) return "too_far";

  const windows = windowsForDate(date, ctx.rules);
  const sMin = timeToMinutes(jstTimeOf(start));
  const inWindow = windows.some((w) => sMin >= timeToMinutes(w.start) && sMin + durationMinutes <= timeToMinutes(w.end));
  if (!inWindow) return "outside_hours";

  if (conflictsWithBlocks({ locationId: location.id, start: s, end: e }, ctx.blocks, location.buffer_minutes)) return "blocked";

  const occupying = ctx.reservations.filter((r) => r.id !== excludeId && isOccupying(r, now));
  const ranges: OccupiedRange[] = occupying.map((r) => ({
    reservationId: r.id,
    locationId: r.location_id,
    start: new Date(r.start_at).getTime(),
    end: new Date(r.end_at).getTime(),
  }));
  if (conflictsWithReservations({ locationId: location.id, start: s, end: e, excludeId }, ranges, ctx.locations)) return "conflict";

  if (location.daily_limit > 0) {
    const sameDay = occupying.filter((r) => r.location_id === location.id && jstDateKey(r.start_at) === date).length;
    if (sameDay >= location.daily_limit) return "daily_limit";
  }
  return null;
}

function jstTimeOf(d: Date): string {
  return new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(11, 16);
}

/** 予約可能な開始時刻の一覧（JST "HH:MM"） */
export function availableSlots(ctx: SlotContext, date: string, durationMinutes: number): string[] {
  const out: string[] = [];
  const step = Math.max(5, ctx.location.slot_interval_minutes);
  for (const w of windowsForDate(date, ctx.rules)) {
    for (let m = timeToMinutes(w.start); m + durationMinutes <= timeToMinutes(w.end); m += step) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      if (checkSlot(ctx, jstDateTime(date, hhmm), durationMinutes) === null) out.push(hhmm);
    }
  }
  return out;
}

export const SLOT_REASON_LABEL: Record<SlotRejectReason, string> = {
  outside_hours: "受付時間外です",
  deadline: "受付締切を過ぎています",
  too_far: "まだ予約を受け付けていない日付です",
  blocked: "この時間は受付できません",
  conflict: "この時間はすでに埋まっています",
  daily_limit: "この日の受付上限に達しました",
  past: "過去の日時です",
};
