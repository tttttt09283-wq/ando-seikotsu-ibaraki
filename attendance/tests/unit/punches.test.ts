import { describe, expect, it } from "vitest";
import { groupPunchesByDay } from "@/lib/attendance/punches";

const p = (id: string, type: string, jst: string) => ({ event_id: id, punch_type: type, punched_at: new Date(`${jst}+09:00`).toISOString() });

describe("打刻を勤務日ごとに分ける", () => {
  it("日跨ぎの退勤は前日に入れ、翌日の勤務は翌日に入れる", () => {
    const punches = [
      p("z", "clock_in", "2026-08-31T21:00:00"),
      p("a", "clock_out", "2026-09-01T02:00:00"), // 前月末の勤務の続き
      p("b", "clock_in", "2026-09-01T09:00:00"),
      p("c", "clock_out", "2026-09-01T18:00:00"),
      p("d", "clock_in", "2026-09-02T20:00:00"),
      p("e", "clock_out", "2026-09-03T01:30:00"),
      p("f", "clock_in", "2026-09-03T10:00:00"),
      p("g", "clock_out", "2026-09-03T19:00:00"),
    ];
    const g = groupPunchesByDay(punches, ["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(g.get("2026-09-01")?.map((x) => x.event_id)).toEqual(["b", "c"]);
    expect(g.get("2026-09-02")?.map((x) => x.event_id)).toEqual(["d", "e"]);
    expect(g.get("2026-09-03")?.map((x) => x.event_id)).toEqual(["f", "g"]);
  });
});
