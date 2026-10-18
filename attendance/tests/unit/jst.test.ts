import { describe, expect, it } from "vitest";
import { addDays, formatJstDateTime, isValidDateString, jstDate, jstDateTimeToUtc } from "@/lib/time/jst";

describe("日本時間ユーティリティ", () => {
  it("UTC 15:00 以降は日本時間では翌日になる", () => {
    expect(jstDate(new Date("2026-10-18T14:59:59Z"))).toBe("2026-10-18");
    expect(jstDate(new Date("2026-10-18T15:00:00Z"))).toBe("2026-10-19");
  });

  it("UTC のタイムスタンプを日本時間で表示する", () => {
    expect(formatJstDateTime("2026-10-18T15:30:00Z")).toBe("2026/10/19 00:30");
    expect(formatJstDateTime(null)).toBe("");
  });

  it("日本時間の日付＋時刻を UTC に変換する（日跨ぎ勤務の終了時刻など）", () => {
    expect(jstDateTimeToUtc("2026-10-19", "02:00").toISOString()).toBe("2026-10-18T17:00:00.000Z");
  });

  it("実在しない日付を拒否する", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026/10/18")).toBe(false);
  });

  it("暦日の加減算は月末・年末をまたげる", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
