import { describe, expect, it } from "vitest";
import { ageForValue, bodyAgeMessage, compareWithActualAge, curveValues, estimateBodyAge, measuredValue } from "./bodyAge";
import { BODY_AGE_CURVES } from "@/config/bodyAge";
import { CHECK_ORDER } from "@/config/checks";
import type { Answers } from "@/types";

describe("ageForValue（記録 → 年齢）", () => {
  const balance = BODY_AGE_CURVES.balance;
  it.each([
    [60, 20],
    [58, 30],
    [54, 35],
    [40, 50],
    [8, 80],
    [0, 80],
  ])("片足立ち（男性）%i秒 → %i歳", (sec, age) => {
    expect(Math.round(ageForValue(balance, "male", sec))).toBe(age);
  });

  it.each([
    [35, 20],
    [32, 20],
    [30, 25],
    [27, 45],
    [24.5, 55],
    [15, 82],
    [8, 82],
  ])("30秒スクワット（男性・CS-30の普通の範囲の中央）%f回 → %i歳", (count, age) => {
    expect(Math.round(ageForValue(BODY_AGE_CURVES.legs, "male", count))).toBe(age);
  });

  it("性別「回答しない」・未入力は男女の平均の目安と比べる", () => {
    expect(curveValues(BODY_AGE_CURVES.plank, "unspecified")[0]).toBe(90);
    expect(curveValues(BODY_AGE_CURVES.plank, null)[0]).toBe(90);
  });

  it("どの目安の表も「年齢が上がるほど同じか小さく」並んでいる", () => {
    for (const id of CHECK_ORDER) {
      const curve = BODY_AGE_CURVES[id];
      expect(curve.male).toHaveLength(curve.ages.length);
      expect(curve.female).toHaveLength(curve.ages.length);
      for (let i = 1; i < curve.ages.length; i++) {
        expect(curve.ages[i]).toBeGreaterThan(curve.ages[i - 1]);
        expect(curve.male[i]).toBeLessThanOrEqual(curve.male[i - 1]);
        expect(curve.female[i]).toBeLessThanOrEqual(curve.female[i - 1]);
      }
    }
  });
});

describe("measuredValue（回答 → 年齢と比べる数値）", () => {
  it("片足立ちは左右の代表の秒数の平均（片側だけならその側）", () => {
    expect(measuredValue("balance", { balance: { status: "answered", value: { left: "60plus", right: "10to19" } } })).toBe(37.5);
    expect(measuredValue("balance", { balance: { status: "answered", value: { left: null, right: "5to9" } } })).toBe(7);
  });
  it("前屈は届いた位置の段階", () => {
    expect(measuredValue("flexibility", { flexibility: { status: "answered", value: "ankle" } })).toBe(3);
  });
  it("スキップ・不正な値は null", () => {
    expect(measuredValue("plank", { plank: { status: "skipped" } })).toBeNull();
    expect(measuredValue("plank", { plank: { status: "answered", value: 999 } })).toBeNull();
    expect(measuredValue("legs", {})).toBeNull();
  });
});

describe("estimateBodyAge（姿勢・体幹年齢）", () => {
  const answers: Answers = {
    balance: { status: "answered", value: { left: "60plus", right: "60plus" } }, // 20歳
    plank: { status: "answered", value: 70 }, // 男性 40歳
    flexibility: { status: "answered", value: "ankle" }, // 男性 約47歳
    legs: { status: "answered", value: 27 }, // 男性 45歳
  };

  it("項目ごとの年齢と、その平均を出す", () => {
    const r = estimateBodyAge(answers, "male", 45)!;
    expect(r.items).toEqual([
      { id: "balance", age: 20 },
      { id: "plank", age: 40 },
      { id: "flexibility", age: 47 },
      { id: "legs", age: 45 },
    ]);
    expect(r.age).toBe(38);
    expect(r.comparison).toBe("younger");
    expect(r.diff).toBe(-7);
  });

  it("スキップした項目は使わない", () => {
    const r = estimateBodyAge({ ...answers, balance: { status: "skipped" } }, "male", null)!;
    expect(r.items.map((i) => i.id)).toEqual(["plank", "flexibility", "legs"]);
    expect(r.age).toBe(44);
    expect(r.comparison).toBeNull();
  });

  it("1つも測定していなければ null", () => {
    expect(estimateBodyAge({}, "female", 40)).toBeNull();
  });

  it("年齢は20〜85歳の範囲で表示する", () => {
    const weak: Answers = {
      balance: { status: "answered", value: { left: "lt5", right: "lt5" } },
      plank: { status: "answered", value: 0 },
      flexibility: { status: "answered", value: "knee" },
      legs: { status: "answered", value: 3 },
    };
    const r = estimateBodyAge(weak, "female", 60)!;
    expect(r.age).toBeLessThanOrEqual(85);
    expect(r.age).toBeGreaterThanOrEqual(80);
    expect(r.comparison).toBe("older");
  });
});

describe("compareWithActualAge（実年齢との比較）", () => {
  it.each([
    [40, 45, "younger", -5],
    [43, 45, "same", -2],
    [47, 45, "same", 2],
    [48, 45, "older", 3],
  ] as const)("姿勢・体幹年齢%i歳／実年齢%i歳 → %s", (body, actual, comparison, diff) => {
    expect(compareWithActualAge(body, actual)).toEqual({ comparison, diff });
  });
  it("20歳未満の方は20歳レベルなら年齢相応", () => {
    expect(compareWithActualAge(20, 16).comparison).toBe("same");
  });
  it("実年齢が未入力なら比べない", () => {
    expect(compareWithActualAge(40, null)).toEqual({ comparison: null, diff: null });
  });
});

describe("bodyAgeMessage", () => {
  it("若い・相応・上で、不安をあおらない文面", () => {
    expect(bodyAgeMessage({ age: 38, items: [], comparison: "younger", diff: -7 })).toContain("実年齢より7歳若い");
    expect(bodyAgeMessage({ age: 45, items: [], comparison: "same", diff: 0 })).toContain("年齢相応");
    expect(bodyAgeMessage({ age: 55, items: [], comparison: "older", diff: 10 })).toContain("伸びしろ");
  });
});
