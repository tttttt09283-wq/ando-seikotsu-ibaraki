import { describe, expect, it } from "vitest";
import { calculateResult } from "./scoring";
import { recommendSelfCare } from "./selfcare";
import { SELF_CARE_ITEMS } from "@/config/selfcare";
import type { Answers } from "@/types";

const base: Answers = {
  balance: { status: "answered", value: { left: "30plus", right: "30plus" } },
  legs: { status: "answered", value: 5 },
  flexibility: { status: "answered", value: "shin" },
  shoulder: { status: "answered", value: "asymmetry" },
  condition: {
    status: "answered",
    value: { q1: "rarely", q2: "rarely", q3: "rarely", q4: "rarely", q5: "rarely" },
  },
};

describe("recommendSelfCare", () => {
  it("点数の低い項目から最大3つを提案する", () => {
    const rec = recommendSelfCare(calculateResult(base));
    expect(rec.items).toHaveLength(3);
    // 下半身(4) → 柔軟性(8) → 肩(12)
    expect(rec.items.map((i) => i.category)).toEqual(["legs", "flexibility", "shoulder"]);
    expect(rec.notes).toEqual([]);
  });

  it("スキップした項目には運動を提案しない", () => {
    const rec = recommendSelfCare(calculateResult({ ...base, legs: { status: "skipped" } }));
    expect(rec.items.some((i) => i.category === "legs")).toBe(false);
  });

  it("肩に痛みがある場合は肩の運動を提案せず、相談を案内する", () => {
    const rec = recommendSelfCare(calculateResult({ ...base, shoulder: { status: "answered", value: "pain" } }));
    expect(rec.items.some((i) => i.category === "shoulder")).toBe(false);
    expect(rec.notes.join("")).toContain("肩の運動はおすすめしていません");
  });

  it("日常の痛みが「よくある」場合は軽い内容だけに絞る", () => {
    const rec = recommendSelfCare(
      calculateResult({
        ...base,
        condition: {
          status: "answered",
          value: { q1: "often", q2: "rarely", q3: "rarely", q4: "rarely", q5: "rarely" },
        },
      }),
    );
    expect(rec.items.length).toBeGreaterThan(0);
    expect(rec.items.every((i) => i.gentle)).toBe(true);
    expect(rec.notes.join("")).toContain("専門家への相談");
  });

  it("項目が1つしかなくても同じ項目から補って提案する", () => {
    const rec = recommendSelfCare(calculateResult({ flexibility: { status: "answered", value: "knee" } }));
    expect(rec.items.map((i) => i.category)).toEqual(["flexibility", "flexibility"]);
  });

  it("何も回答がない場合はコンディション系を提案する", () => {
    const rec = recommendSelfCare(calculateResult({}));
    expect(rec.items.every((i) => i.category === "condition")).toBe(true);
    expect(rec.items.length).toBeGreaterThan(0);
  });

  it("全セルフケアに必須項目（名称・目的・方法・回数・注意点）がそろっている", () => {
    for (const item of SELF_CARE_ITEMS) {
      expect(item.name).not.toBe("");
      expect(item.purpose).not.toBe("");
      expect(item.steps.length).toBeGreaterThan(0);
      expect(item.amount).not.toBe("");
      expect(item.cautions.length).toBeGreaterThan(0);
    }
  });
});
