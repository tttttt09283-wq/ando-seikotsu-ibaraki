import { describe, expect, it } from "vitest";
import { availableSlots, checkSlot, isOccupying, windowsForDate, type SlotContext } from "./availability";
import { SEED_LOCATIONS, SEED_RULES } from "../repo/seed";
import type { AvailabilityRule, Location, Reservation } from "./types";
import { jstDateTime } from "../time";
import { NOW, DAY } from "@/test/fixtures";

const locs = new Map<string, Location>(SEED_LOCATIONS.map((l) => [l.id, { ...l }]));
const home = locs.get("home")!;
const rules: AvailabilityRule[] = SEED_RULES.map((r, i) => ({ ...r, id: `r${i}` }));

type R = SlotContext["reservations"][number];
function res(id: string, loc: string, date: string, time: string, minutes: number, status: Reservation["status"] = "confirmed", hold: string | null = null): R {
  const s = jstDateTime(date, time);
  return { id, location_id: loc, status, hold_expires_at: hold, start_at: s.toISOString(), end_at: new Date(s.getTime() + minutes * 60000).toISOString() };
}
function ctx(over: Partial<SlotContext> = {}): SlotContext {
  return { location: home, locations: locs, rules, blocks: [], reservations: [], now: NOW, ...over };
}

describe("営業時間", () => {
  it("曜日ルール（月曜 10-19 / 日曜は休み）", () => {
    expect(windowsForDate(DAY, rules)).toEqual([{ start: "10:00", end: "19:00" }]);
    expect(windowsForDate("2026-11-15", rules)).toEqual([]);
  });
  it("指定日の休業日・営業時間は曜日ルールより優先", () => {
    const extra: AvailabilityRule[] = [
      ...rules,
      { id: "x", location_id: "home", weekday: null, specific_date: DAY, start_time: null, end_time: null, is_closed: true, note: "休業" },
      { id: "y", location_id: "home", weekday: null, specific_date: "2026-11-15", start_time: "13:00", end_time: "15:00", is_closed: false, note: null },
    ];
    expect(windowsForDate(DAY, extra)).toEqual([]);
    expect(windowsForDate("2026-11-15", extra)).toEqual([{ start: "13:00", end: "15:00" }]);
  });
});

describe("予約枠の計算", () => {
  it("施術時間が営業時間内に収まる枠だけ出す", () => {
    const slots = availableSlots(ctx(), DAY, 90);
    expect(slots[0]).toBe("10:00");
    expect(slots.at(-1)).toBe("17:30"); // 17:30+90分=19:00
  });

  it("受付締切（24時間前）・過去・予約可能日数", () => {
    expect(checkSlot(ctx(), jstDateTime("2026-11-12", "18:00"), 60)).toBe("deadline");
    expect(checkSlot(ctx(), jstDateTime("2026-11-11", "10:00"), 60)).toBe("past");
    expect(checkSlot(ctx(), jstDateTime("2027-02-01", "10:00"), 60)).toBe("too_far");
  });

  it("確定済みの枠とバッファ時間（15分）は選べない", () => {
    const c = ctx({ reservations: [res("a", "home", DAY, "10:00", 60)] });
    expect(checkSlot(c, jstDateTime(DAY, "10:30"), 60)).toBe("conflict");
    expect(checkSlot(c, jstDateTime(DAY, "11:00"), 60)).toBe("conflict"); // 11:00 はバッファ中
    expect(checkSlot(c, jstDateTime(DAY, "11:30"), 60)).toBeNull();
    // 後ろ側：9:30開始の60分は 10:00 予約の前にバッファが取れない…が営業時間外なので 12:00 予約で確認
    const c2 = ctx({ reservations: [res("b", "home", DAY, "12:00", 60)] });
    expect(checkSlot(c2, jstDateTime(DAY, "11:00"), 60)).toBe("conflict"); // 12:00まで＋バッファ15分が必要
    expect(checkSlot(c2, jstDateTime(DAY, "10:30"), 60)).toBeNull();
  });

  it("同一施術者の別拠点の予約とは重複できず、移動時間（60分）もブロックする", () => {
    const c = ctx({ reservations: [res("w", "ibaraki", DAY, "13:00", 60)] });
    expect(checkSlot(c, jstDateTime(DAY, "13:00"), 60)).toBe("conflict");
    // 茨木 13:00-14:00 → バッファ10分 + 移動60分 → 自宅は 15:10 以降
    expect(checkSlot(c, jstDateTime(DAY, "15:00"), 60)).toBe("conflict");
    expect(checkSlot(c, jstDateTime(DAY, "15:30"), 60)).toBeNull();
    // 自宅が先：自宅終了 + 15分 + 60分 <= 13:00 → 自宅は 10:45 までに終了
    expect(checkSlot(c, jstDateTime(DAY, "11:00"), 60)).toBe("conflict");
    expect(checkSlot(c, jstDateTime(DAY, "10:30"), 30)).toBeNull();
  });

  it("期限切れのホールドは枠を占有しない（自動解放）", () => {
    const expiredHold = res("h", "home", DAY, "10:00", 60, "pending_line", "2026-11-11T23:00:00Z");
    const liveHold = res("h2", "home", DAY, "14:00", 60, "pending_line", "2026-11-12T01:00:00Z");
    expect(isOccupying(expiredHold, NOW)).toBe(false);
    expect(isOccupying(liveHold, NOW)).toBe(true);
    const c = ctx({ reservations: [expiredHold, liveHold] });
    expect(checkSlot(c, jstDateTime(DAY, "10:00"), 60)).toBeNull();
    expect(checkSlot(c, jstDateTime(DAY, "14:00"), 60)).toBe("conflict");
  });

  it("キャンセル・期限切れ・完了の予約は枠を占有しない", () => {
    const c = ctx({ reservations: [res("c", "home", DAY, "10:00", 60, "cancelled"), res("e", "home", DAY, "12:00", 60, "expired")] });
    expect(checkSlot(c, jstDateTime(DAY, "10:00"), 60)).toBeNull();
    expect(checkSlot(c, jstDateTime(DAY, "12:00"), 60)).toBeNull();
  });

  it("手動ブロック（拠点指定・全拠点）", () => {
    const c = ctx({
      blocks: [
        { id: "b1", location_id: "home", practitioner_key: "iwanaga", start_at: jstDateTime(DAY, "10:00").toISOString(), end_at: jstDateTime(DAY, "12:00").toISOString(), reason: null },
        { id: "b2", location_id: null, practitioner_key: "iwanaga", start_at: jstDateTime(DAY, "15:00").toISOString(), end_at: jstDateTime(DAY, "16:00").toISOString(), reason: "私用" },
        { id: "b3", location_id: "ibaraki", practitioner_key: "iwanaga", start_at: jstDateTime(DAY, "17:00").toISOString(), end_at: jstDateTime(DAY, "18:00").toISOString(), reason: null },
      ],
    });
    expect(checkSlot(c, jstDateTime(DAY, "11:00"), 60)).toBe("blocked");
    expect(checkSlot(c, jstDateTime(DAY, "15:30"), 30)).toBe("blocked");
    expect(checkSlot(c, jstDateTime(DAY, "17:00"), 60)).toBeNull(); // 他拠点のブロックは関係ない
  });

  it("1日の予約上限", () => {
    const limited = { ...home, daily_limit: 2 };
    const c = ctx({ location: limited, locations: new Map([...locs, ["home", limited]]), reservations: [res("1", "home", DAY, "10:00", 60), res("2", "home", DAY, "12:00", 60)] });
    expect(checkSlot(c, jstDateTime(DAY, "15:00"), 60)).toBe("daily_limit");
    expect(availableSlots(c, DAY, 60)).toEqual([]);
  });
});
