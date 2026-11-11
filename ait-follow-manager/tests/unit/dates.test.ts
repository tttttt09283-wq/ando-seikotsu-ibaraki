import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate, todayInTimeZone } from "@/lib/dates";

describe("日付", () => {
  it("JST の日付境界", () => {
    // UTC 14:59 = JST 23:59、UTC 15:00 = JST 翌0:00
    expect(todayInTimeZone("Asia/Tokyo", new Date("2026-11-10T14:59:00Z"))).toBe("2026-11-10");
    expect(todayInTimeZone("Asia/Tokyo", new Date("2026-11-10T15:00:00Z"))).toBe("2026-11-11");
  });

  it("暦日計算", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("日付形式の検証", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026/01/01")).toBe(false);
  });
});
