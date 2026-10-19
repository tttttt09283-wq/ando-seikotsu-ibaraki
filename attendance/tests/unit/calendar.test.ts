import { describe, expect, it } from "vitest";
import { formatSlots, normalizeDaySlots, parseWeeklyHours, slotFieldName } from "@/lib/calendar";

describe("診療時間の入力", () => {
  it("午前・午後の2枠を開始時刻順に並べる", () => {
    const r = normalizeDaySlots(
      [
        { open: "15:00", close: "20:00" },
        { open: "09:00", close: "12:30" },
      ],
      "月曜",
    );
    expect(r).toEqual({
      ok: true,
      slots: [
        { open: "09:00", close: "12:30" },
        { open: "15:00", close: "20:00" },
      ],
    });
  });

  it("片方だけの入力・逆転・重なりはエラー", () => {
    expect(normalizeDaySlots([{ open: "09:00" }], "月曜").ok).toBe(false);
    expect(normalizeDaySlots([{ open: "12:00", close: "09:00" }], "月曜").ok).toBe(false);
    const overlap = normalizeDaySlots(
      [
        { open: "09:00", close: "13:00" },
        { open: "12:00", close: "18:00" },
      ],
      "月曜",
    );
    expect(overlap).toEqual({ ok: false, message: "月曜：診療枠が重なっています" });
  });

  it("フォーム全体を曜日別の枠に変換し、空欄の曜日は定休日になる", () => {
    const fd = new FormData();
    fd.set(slotFieldName(1, 1, "open"), "09:00");
    fd.set(slotFieldName(1, 1, "close"), "12:00");
    fd.set(slotFieldName(7, 1, "open"), "09:00");
    fd.set(slotFieldName(7, 1, "close"), "13:00");
    expect(parseWeeklyHours(fd)).toEqual({
      ok: true,
      slots: [
        { day_of_week: 1, open: "09:00", close: "12:00" },
        { day_of_week: 7, open: "09:00", close: "13:00" },
      ],
    });
  });

  it("祝日枠のエラーは「祝日」と表示する", () => {
    const fd = new FormData();
    fd.set(slotFieldName(7, 1, "open"), "13:00");
    fd.set(slotFieldName(7, 1, "close"), "09:00");
    const r = parseWeeklyHours(fd);
    expect(r.ok === false && r.message).toBe("祝日：終了時刻は開始時刻より後にしてください");
  });

  it("表示用の文字列", () => {
    expect(formatSlots([])).toBe("休診");
    expect(formatSlots([{ open: "09:00:00", close: "12:30:00" }, { open: "15:00:00", close: "20:00:00" }])).toBe(
      "09:00〜12:30 / 15:00〜20:00",
    );
  });
});
