import { describe, expect, it } from "vitest";
import { buildBodyCheckSummary, buildBookingUrl } from "./booking";
import { estimateBodyAge } from "./bodyAge";
import { calculateResult } from "./scoring";

const BASE = "https://ando-seikotsu-kourien.vercel.app/booking.html";

describe("buildBodyCheckSummary（予約フォームに渡す結果の要約）", () => {
  it("姿勢・体幹年齢（実年齢）とスコア・ランクを含める", () => {
    const answers = {
      legs: { status: "answered", value: 27 },
      flexibility: { status: "answered", value: "shin" },
    } as const;
    const result = calculateResult(answers);
    const bodyAge = estimateBodyAge(answers, "male", 50)!;
    const summary = buildBodyCheckSummary(result, bodyAge, 50);
    expect(summary).toBe(`姿勢・体幹年齢 ${bodyAge.age}歳（実年齢50歳）／スコア${result.total}点・${result.rank}ランク`);
  });
  it("姿勢・体幹年齢が出ない場合はスコアだけ", () => {
    const result = calculateResult({ flexibility: { status: "answered", value: "palm" } });
    expect(buildBodyCheckSummary(result, null)).toBe("スコア100点・Sランク");
  });
  it("何も測定していない場合", () => {
    expect(buildBodyCheckSummary(calculateResult({}), null)).toContain("結果なし");
  });
});

describe("buildBookingUrl（予約URLに目印を付ける）", () => {
  it("src=body-check と要約を付ける", () => {
    const url = new URL(buildBookingUrl(BASE, "姿勢・体幹年齢 32歳"));
    expect(url.origin + url.pathname).toBe(BASE);
    expect(url.searchParams.get("src")).toBe("body-check");
    expect(url.searchParams.get("bc")).toBe("姿勢・体幹年齢 32歳");
  });
  it("元のURLにあるパラメータは残す", () => {
    const url = new URL(buildBookingUrl(`${BASE}?store=1`, "x"));
    expect(url.searchParams.get("store")).toBe("1");
    expect(url.searchParams.get("src")).toBe("body-check");
  });
  it("要約は100文字までに切る", () => {
    const url = new URL(buildBookingUrl(BASE, "あ".repeat(300)));
    expect(url.searchParams.get("bc")).toHaveLength(100);
  });
});
