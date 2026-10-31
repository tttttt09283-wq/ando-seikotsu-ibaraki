import { describe, expect, it } from "vitest";
import { buildDetailedFeedback, getFeedbackLevel } from "./feedback";
import { calculateResult } from "./scoring";
import { CHECK_ORDER } from "@/config/checks";
import { FEEDBACK } from "@/config/feedback";
import type { Answers } from "@/types";

const allGood: Answers = {
  balance: { status: "answered", value: { left: "60plus", right: "60plus" } },
  plank: { status: "answered", value: 120 },
  flexibility: { status: "answered", value: "palm" },
  legs: { status: "answered", value: 30 },
};

describe("getFeedbackLevel", () => {
  it.each([
    [20, "good"],
    [16, "good"],
    [15, "fair"],
    [10, "fair"],
    [9.9, "low"],
    [0, "low"],
  ])("%f点 → %s", (score, level) => {
    expect(getFeedbackLevel(score)).toBe(level);
  });
});

describe("buildDetailedFeedback", () => {
  it("全項目良好なら相談ポイントはなく、メンテナンスの一文を出す", () => {
    const f = buildDetailedFeedback(calculateResult(allGood));
    expect(f.items).toHaveLength(4);
    expect(f.items.every((i) => i.level === "good")).toBe(true);
    expect(f.consultPoints).toEqual([]);
    expect(f.allGoodMessage).not.toBeNull();
  });

  it("点数の低い項目から整骨院で確認できることを並べる", () => {
    const answers: Answers = {
      ...allGood,
      legs: { status: "answered", value: 5 }, // 4点 → low
      flexibility: { status: "answered", value: "ankle" }, // 12点 → fair
    };
    const f = buildDetailedFeedback(calculateResult(answers));
    expect(f.consultPoints.map((c) => c.id)).toEqual(["legs", "flexibility"]);
    expect(f.allGoodMessage).toBeNull();
    expect(f.items.find((i) => i.id === "legs")?.level).toBe("low");
  });

  it("スキップした項目は解説に含めない", () => {
    const answers: Answers = { ...allGood, plank: { status: "skipped" } };
    const f = buildDetailedFeedback(calculateResult(answers));
    expect(f.items.map((i) => i.id)).not.toContain("plank");
  });

  it("全項目・全レベルの文章がそろっている（まずまず・要チェックには整骨院で確認できることが必須）", () => {
    for (const id of CHECK_ORDER) {
      for (const level of ["good", "fair", "low"] as const) {
        const t = FEEDBACK[id][level];
        expect(t.headline).not.toBe("");
        expect(t.goodPoint).not.toBe("");
        expect(t.caution).not.toBe("");
        if (level !== "good") expect(t.clinic).toBeTruthy();
      }
    }
  });
});
