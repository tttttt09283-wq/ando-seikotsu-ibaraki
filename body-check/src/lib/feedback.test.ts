import { describe, expect, it } from "vitest";
import { buildDetailedFeedback, getFeedbackLevel } from "./feedback";
import { calculateResult } from "./scoring";
import { CHECK_ORDER } from "@/config/checks";
import { FEEDBACK } from "@/config/feedback";
import type { Answers } from "@/types";

const allGood: Answers = {
  balance: { status: "answered", value: { left: "30plus", right: "30plus" } },
  legs: { status: "answered", value: 30 },
  flexibility: { status: "answered", value: "palm" },
  shoulder: { status: "answered", value: "smooth" },
  condition: { status: "answered", value: { q1: "rarely", q2: "rarely", q3: "rarely", q4: "rarely", q5: "rarely" } },
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
    const f = buildDetailedFeedback(calculateResult(allGood), allGood);
    expect(f.items).toHaveLength(5);
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
    const f = buildDetailedFeedback(calculateResult(answers), answers);
    expect(f.consultPoints.map((c) => c.id)).toEqual(["legs", "flexibility"]);
    expect(f.allGoodMessage).toBeNull();
    expect(f.items.find((i) => i.id === "legs")?.level).toBe("low");
  });

  it("スキップした項目は解説に含めない", () => {
    const answers: Answers = { ...allGood, shoulder: { status: "skipped" } };
    const f = buildDetailedFeedback(calculateResult(answers), answers);
    expect(f.items.map((i) => i.id)).not.toContain("shoulder");
  });

  it("肩に痛みがある場合は注意書きを付ける", () => {
    const answers: Answers = { ...allGood, shoulder: { status: "answered", value: "pain" } };
    const f = buildDetailedFeedback(calculateResult(answers), answers);
    expect(f.painNote).toContain("早めにご相談");
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
