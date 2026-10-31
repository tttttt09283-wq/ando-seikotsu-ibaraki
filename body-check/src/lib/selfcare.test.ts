import { describe, expect, it } from "vitest";
import { calculateResult } from "./scoring";
import { recommendSelfCare } from "./selfcare";
import { SELF_CARE_ITEMS } from "@/config/selfcare";
import type { Answers } from "@/types";

const base: Answers = {
  balance: { status: "answered", value: { left: "60plus", right: "60plus" } },
  plank: { status: "answered", value: 10 },
  flexibility: { status: "answered", value: "shin" },
  legs: { status: "answered", value: 12 },
};

describe("recommendSelfCare", () => {
  it("点数の低い項目から最大3つを提案する", () => {
    const rec = recommendSelfCare(calculateResult(base));
    expect(rec.items).toHaveLength(3);
    // 体幹(4) → 柔軟性(8) → 瞬発力(8)
    expect(rec.items.map((i) => i.category)).toEqual(["plank", "flexibility", "legs"]);
    expect(rec.notes).toEqual([]);
  });

  it("スキップした項目には運動を提案しない", () => {
    const rec = recommendSelfCare(calculateResult({ ...base, legs: { status: "skipped" } }));
    expect(rec.items.some((i) => i.category === "legs")).toBe(false);
  });

  it("項目が1つしかなくても同じ項目から補って提案する", () => {
    const rec = recommendSelfCare(calculateResult({ flexibility: { status: "answered", value: "knee" } }));
    expect(rec.items.map((i) => i.category)).toEqual(["flexibility", "flexibility"]);
  });

  it("何も回答がない場合は、ごく軽い体幹のケアだけを提案し、相談を案内する", () => {
    const rec = recommendSelfCare(calculateResult({}));
    expect(rec.items.length).toBeGreaterThan(0);
    expect(rec.items.every((i) => i.category === "plank" && i.gentle)).toBe(true);
    expect(rec.notes.join("")).toContain("専門スタッフにご相談");
  });

  it("4つのチェックすべてにセルフケアが2つ以上ある", () => {
    for (const id of ["balance", "plank", "flexibility", "legs"]) {
      expect(SELF_CARE_ITEMS.filter((i) => i.category === id).length).toBeGreaterThanOrEqual(2);
    }
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
