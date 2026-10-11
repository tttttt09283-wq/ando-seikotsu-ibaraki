import { describe, expect, it } from "vitest";
import { buildBodyCheckSummary, buildBookingUrl } from "./booking";
import { estimateBodyAge } from "./bodyAge";
import { calculateResult } from "./scoring";

const BASE = "https://ando-seikotsu-kourien.vercel.app/booking.html";

describe("buildBodyCheckSummary（予約フォームに渡す結果の要約）", () => {
  it("カラダ年齢とスコア・ランクを含める", () => {
    const result = calculateResult({
      legs: { status: "answered", value: 22 },
      flexibility: { status: "answered", value: "shin" },
      shoulder: { status: "answered", value: "smooth" },
    });
    const summary = buildBodyCheckSummary(result, estimateBodyAge(22, "male", "50s"));
    expect(summary).toBe(`カラダ年齢 50代レベル／スコア${result.total}点・${result.rank}ランク`);
  });
  it("カラダ年齢が出ない場合はスコアだけ", () => {
    const result = calculateResult({ flexibility: { status: "answered", value: "palm" } });
    expect(buildBodyCheckSummary(result, null)).toBe("スコア100点・Sランク");
  });
  it("何も測定していない場合", () => {
    expect(buildBodyCheckSummary(calculateResult({}), null)).toContain("結果なし");
  });
});

describe("buildBookingUrl（予約URLに目印を付ける）", () => {
  it("src=body-check と要約を付ける", () => {
    const url = new URL(buildBookingUrl(BASE, "カラダ年齢 20代レベル"));
    expect(url.origin + url.pathname).toBe(BASE);
    expect(url.searchParams.get("src")).toBe("body-check");
    expect(url.searchParams.get("bc")).toBe("カラダ年齢 20代レベル");
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
