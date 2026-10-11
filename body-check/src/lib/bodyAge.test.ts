import { describe, expect, it } from "vitest";
import { bodyAgeMessage, compareWithActualAge, estimateBodyAge, normalLowerBound } from "./bodyAge";
import { CS30_AGE_BANDS } from "@/config/bodyAge";

const label = (count: number, sex: "male" | "female" | "unspecified") => estimateBodyAge(count, sex, null)?.band.label;

describe("estimateBodyAge（30秒椅子立ち上がり → カラダ年齢）", () => {
  it.each([
    [35, "20代"],
    [28, "20代"],
    [27, "30代"],
    [26, "30代"],
    [25, "40代"],
    [22, "50代"],
    [20, "60代前半"],
    [18, "60代後半"],
    [16, "70代前半"],
    [15, "70代後半"],
    [14, "80代以上"],
  ])("男性 %i回 → %s", (count, expected) => {
    expect(label(count, "male")).toBe(expected);
  });

  it.each([
    [30, "20代"],
    [23, "20代"],
    [22, "50代"],
    [20, "50代"],
    [19, "60代前半"],
    [17, "60代後半"],
    [15, "70代前半"],
    [13, "70代後半"],
  ])("女性 %i回 → %s", (count, expected) => {
    expect(label(count, "female")).toBe(expected);
  });

  it("どの年代の「普通」にも届かない場合は80代以上として印を付ける", () => {
    const r = estimateBodyAge(5, "male", null)!;
    expect(r.band.label).toBe("80代以上");
    expect(r.belowAllBands).toBe(true);
    expect(estimateBodyAge(14, "male", null)!.belowAllBands).toBe(false);
  });

  it("性別を回答しない場合は男女の平均で判定する", () => {
    expect(normalLowerBound(CS30_AGE_BANDS[0], "unspecified")).toBe(25.5);
    expect(label(26, "unspecified")).toBe("20代");
    expect(label(25, "unspecified")).toBe("30代");
  });

  it("回数が不正・性別が未入力なら判定しない", () => {
    expect(estimateBodyAge(-1, "male", null)).toBeNull();
    expect(estimateBodyAge(51, "male", null)).toBeNull();
    expect(estimateBodyAge(20, null, null)).toBeNull();
  });

  it("年代が若いほど「普通」の下限は同じか低くなる（データの並びの確認）", () => {
    for (const sex of ["male", "unspecified"] as const) {
      for (let i = 1; i < CS30_AGE_BANDS.length; i++) {
        expect(normalLowerBound(CS30_AGE_BANDS[i], sex)).toBeLessThanOrEqual(normalLowerBound(CS30_AGE_BANDS[i - 1], sex));
      }
    }
  });
});

describe("実年代との比較", () => {
  it("若い・同じ・伸びしろを判定する", () => {
    expect(compareWithActualAge(0, "40s")).toBe("younger");
    expect(compareWithActualAge(2, "40s")).toBe("same");
    expect(compareWithActualAge(3, "40s")).toBe("older");
  });
  it("60代は前半・後半どちらでも年代相応", () => {
    expect(compareWithActualAge(4, "60s")).toBe("same");
    expect(compareWithActualAge(5, "60s")).toBe("same");
    expect(compareWithActualAge(3, "60s")).toBe("younger");
  });
  it("10代は20代の標準値と比べる", () => {
    expect(compareWithActualAge(0, "10s")).toBe("same");
  });
  it("年代未回答なら比較しない", () => {
    expect(compareWithActualAge(0, null)).toBeNull();
  });
  it("メッセージが比較結果に応じて変わる", () => {
    const r = estimateBodyAge(30, "male", "50s")!;
    expect(r.comparison).toBe("younger");
    expect(bodyAgeMessage(r)).toContain("若い");
  });
});
