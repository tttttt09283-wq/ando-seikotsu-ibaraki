import { describe, expect, it } from "vitest";
import { addMonthsToDate, grantDateOf, nextPlannedGrant, statutoryDays } from "@/lib/leave/schedule";

const fullTime = { weeklyDays: 5, weeklyMinutes: 2400 };

describe("有給休暇の付与予定", () => {
  it("入社6か月後に10日、以後1年ごとに11・12・14・16・18・20日", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 10].map((i) => statutoryDays(i, fullTime).days)).toEqual([10, 11, 12, 14, 16, 18, 20, 20, 20]);
    expect(grantDateOf("2024-04-01", 0)).toBe("2024-10-01");
    expect(grantDateOf("2024-04-01", 2)).toBe("2026-10-01");
  });

  it("週4日以下かつ週30時間未満は比例付与", () => {
    expect(statutoryDays(0, { weeklyDays: 4, weeklyMinutes: 1680 })).toEqual({ days: 7, type: "proportional" });
    expect(statutoryDays(6, { weeklyDays: 3, weeklyMinutes: 1200 })).toEqual({ days: 11, type: "proportional" });
    expect(statutoryDays(0, { weeklyDays: 1, weeklyMinutes: 480 })).toEqual({ days: 1, type: "proportional" });
    // 週4日でも30時間以上なら通常付与
    expect(statutoryDays(0, { weeklyDays: 4, weeklyMinutes: 1920 })).toEqual({ days: 10, type: "statutory" });
  });

  it("月末の入社日は付与月の末日に丸める", () => {
    expect(addMonthsToDate("2025-08-31", 6)).toBe("2026-02-28");
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("次の付与予定：付与済みは飛ばし、付与漏れも拾う。先の予定は対象外", () => {
    expect(nextPlannedGrant("2024-04-01", fullTime, ["2024-10-01"], "2026-09-15")).toEqual({
      grantDate: "2025-10-01",
      index: 1,
      days: 11,
      type: "statutory",
    });
    expect(nextPlannedGrant("2024-04-01", fullTime, ["2024-10-01", "2025-10-01"], "2026-09-15")).toMatchObject({ grantDate: "2026-10-01", days: 12 });
    expect(nextPlannedGrant("2026-09-01", fullTime, [], "2026-10-19")).toBeNull(); // 2027-03-01 は30日より先
  });
});
