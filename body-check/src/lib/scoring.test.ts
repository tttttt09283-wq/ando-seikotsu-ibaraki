/**
 * 採点ロジックの単体テスト（「npm test」で実行できます）
 * 単体テスト = 小さな部品ごとに、期待どおりの計算結果になるかを自動で確認する仕組みです。
 */
import { describe, expect, it } from "vitest";
import {
  balanceOptionIdForSeconds,
  buildResultMessages,
  calculateResult,
  getRank,
  isValidLegsCount,
  joinCheckNames,
  parseCount,
  scoreBalance,
  scoreCondition,
  scoreLegs,
} from "./scoring";
import type { Answers } from "@/types";

const allGood: Answers = {
  balance: { status: "answered", value: { left: "30plus", right: "30plus" } },
  legs: { status: "answered", value: 30 },
  flexibility: { status: "answered", value: "palm" },
  shoulder: { status: "answered", value: "smooth" },
  condition: {
    status: "answered",
    value: { q1: "rarely", q2: "rarely", q3: "rarely", q4: "rarely", q5: "rarely" },
  },
};

describe("scoreBalance（片足立ち）", () => {
  it("左右の平均点になる", () => {
    expect(scoreBalance({ left: "30plus", right: "lt5" })).toBe(12);
  });
  it("片側のみの回答ならその側の点数", () => {
    expect(scoreBalance({ left: null, right: "20to29" })).toBe(16);
  });
  it("左右とも未回答なら null", () => {
    expect(scoreBalance({ left: null, right: null })).toBeNull();
  });
  it("存在しない選択肢は無視する", () => {
    expect(scoreBalance({ left: "xxx", right: "10to19" })).toBe(12);
  });
});

describe("balanceOptionIdForSeconds（ストップウォッチ → 選択肢）", () => {
  it.each([
    [0, "lt5"],
    [4.9, "lt5"],
    [5, "5to9"],
    [9.99, "5to9"],
    [10, "10to19"],
    [29.5, "20to29"],
    [30, "30plus"],
    [60, "30plus"],
  ])("%f秒 → %s", (sec, id) => {
    expect(balanceOptionIdForSeconds(sec)).toBe(id);
  });
  it("不正な値は null", () => {
    expect(balanceOptionIdForSeconds(-1)).toBeNull();
    expect(balanceOptionIdForSeconds(Number.NaN)).toBeNull();
  });
});

describe("parseCount（回数の入力）", () => {
  it("半角・全角の数字を読み取る", () => {
    expect(parseCount("12")).toBe(12);
    expect(parseCount("１２")).toBe(12);
    expect(parseCount(" 7 ")).toBe(7);
  });
  it("数字以外は null", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("1.5")).toBeNull();
    expect(parseCount("-3")).toBeNull();
    expect(parseCount("十")).toBeNull();
  });
});

describe("scoreLegs（30秒椅子立ち上がり）", () => {
  it.each([
    [0, 4],
    [9, 4],
    [10, 8],
    [14, 8],
    [15, 12],
    [20, 16],
    [24, 16],
    [25, 20],
    [50, 20],
  ])("%i回 → %i点", (count, points) => {
    expect(scoreLegs(count)).toBe(points);
  });
  it("範囲外・小数は採点しない", () => {
    expect(scoreLegs(-1)).toBeNull();
    expect(scoreLegs(51)).toBeNull();
    expect(scoreLegs(10.5)).toBeNull();
    expect(scoreLegs(Number.NaN)).toBeNull();
  });
  it("isValidLegsCount は 0〜50 の整数だけを許可する", () => {
    expect(isValidLegsCount(0)).toBe(true);
    expect(isValidLegsCount(50)).toBe(true);
    expect(isValidLegsCount("10")).toBe(false);
    expect(isValidLegsCount(51)).toBe(false);
  });
});

describe("scoreCondition（コンディション）", () => {
  it("5問の合計点（ほとんどない=4, ときどき=2, よくある=0）", () => {
    expect(scoreCondition({ q1: "rarely", q2: "sometimes", q3: "often", q4: "rarely", q5: "sometimes" })).toBe(12);
  });
  it("1問でも未回答なら null", () => {
    expect(scoreCondition({ q1: "rarely", q2: "rarely", q3: "rarely", q4: "rarely" })).toBeNull();
  });
});

describe("getRank（ランク判定）", () => {
  it.each([
    [100, "S"],
    [90, "S"],
    [89, "A"],
    [75, "A"],
    [74, "B"],
    [60, "B"],
    [59, "C"],
    [0, "C"],
  ])("%i点 → %sランク", (score, rank) => {
    expect(getRank(score)).toBe(rank);
  });
});

describe("calculateResult（総合スコア）", () => {
  it("全項目満点なら100点・Sランク", () => {
    const r = calculateResult(allGood);
    expect(r.total).toBe(100);
    expect(r.rank).toBe("S");
    expect(r.answeredCount).toBe(5);
    expect(r.insufficient).toBe(false);
    expect(r.improvements).toEqual([]);
    expect(r.strengths).toHaveLength(5);
  });

  it("スキップした項目は0点扱いにせず、回答済み項目だけで100点換算する", () => {
    const r = calculateResult({
      ...allGood,
      legs: { status: "skipped" },
      flexibility: { status: "skipped" },
    });
    expect(r.total).toBe(100);
    expect(r.answeredCount).toBe(3);
    expect(r.items.find((i) => i.id === "legs")?.score).toBeNull();
    expect(r.items.find((i) => i.id === "legs")?.summary).toContain("採点から除外");
  });

  it("得点の合計を100点満点に換算する（例：68点）", () => {
    // 12 + 12 + 8 + 20 + 16 = 68 / 100
    const r = calculateResult({
      balance: { status: "answered", value: { left: "10to19", right: "10to19" } },
      legs: { status: "answered", value: 16 },
      flexibility: { status: "answered", value: "shin" },
      shoulder: { status: "answered", value: "smooth" },
      condition: {
        status: "answered",
        value: { q1: "rarely", q2: "rarely", q3: "rarely", q4: "rarely", q5: "often" },
      },
    });
    expect(r.total).toBe(68);
    expect(r.rank).toBe("B");
    // 低い順：柔軟性(8) → バランス(12) → 下半身(12)
    expect(r.improvements).toEqual(["flexibility", "balance", "legs"]);
    expect(r.strengths).toEqual(["shoulder", "condition"]);
  });

  it("回答が少ないと「参考情報が不足」になる", () => {
    const r = calculateResult({ flexibility: { status: "answered", value: "palm" } });
    expect(r.answeredCount).toBe(1);
    expect(r.insufficient).toBe(true);
    expect(r.total).toBe(100);
  });

  it("1つも回答がない場合はスコアなし", () => {
    const r = calculateResult({});
    expect(r.total).toBeNull();
    expect(r.rank).toBeNull();
    expect(r.insufficient).toBe(true);
  });

  it("痛みに関する回答をフラグとして検出する", () => {
    const r = calculateResult({
      ...allGood,
      shoulder: { status: "answered", value: "pain" },
      condition: {
        status: "answered",
        value: { q1: "often", q2: "rarely", q3: "rarely", q4: "rarely", q5: "rarely" },
      },
    });
    expect(r.painFlags).toEqual({ shoulderPain: true, dailyPainOften: true });
  });
});

describe("結果メッセージ", () => {
  it("項目名を「、」と「と」でつなぐ", () => {
    expect(joinCheckNames(["flexibility", "legs"])).toBe("柔軟性と下半身の筋持久力");
    expect(joinCheckNames(["flexibility", "legs", "balance"])).toBe("柔軟性、下半身の筋持久力とバランス");
  });
  it("改善の余地がある項目をメッセージに含める", () => {
    const r = calculateResult({
      ...allGood,
      flexibility: { status: "answered", value: "knee" },
      legs: { status: "answered", value: 5 },
    });
    const m = buildResultMessages(r);
    expect(m.headline).toBe(`あなたのカラダコンディションは${r.total}点！`);
    expect(m.detail).toContain("下半身の筋持久力と柔軟性に改善の余地");
  });
  it("採点できない場合も不安をあおらない文面", () => {
    const m = buildResultMessages(calculateResult({}));
    expect(m.headline).toContain("採点できる項目がありません");
  });
});
