import { describe, expect, it } from "vitest";
import { buildTally, isInLine, readSource } from "./tally";
import { createInitialState } from "./storage";
import { calculateResult } from "./scoring";
import { estimateBodyAge } from "./bodyAge";
import type { Answers } from "@/types";

describe("readSource（どこから開いたか）", () => {
  it("?src= を読み取る（英小文字・数字・_・- だけ）", () => {
    expect(readSource("?src=line")).toBe("line");
    expect(readSource("?src=QR")).toBe("qr");
    expect(readSource("?src=<script>")).toBe("script");
    expect(readSource("")).toBeNull();
    expect(readSource("?src=")).toBeNull();
  });
});

describe("isInLine（LINEのアプリ内か）", () => {
  it("LINEのブラウザを見分ける", () => {
    expect(isInLine("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.0.0")).toBe(true);
    expect(isInLine("Mozilla/5.0 (iPhone) Safari/604.1")).toBe(false);
  });
});

describe("buildTally（送る内容）", () => {
  const state = { ...createInitialState(), source: "line", profile: { age: 45, ageGroup: "40s" as const, sex: "male" as const, symptoms: ["low_back" as const] } };
  it("開始：匿名ID・年齢・性別・症状・どこからだけ（結果は送らない）", () => {
    const b = buildTally("start", state, null, null, "Line/14.0");
    expect(b).toEqual({ session_id: state.sessionId, event: "start", source: "line", in_line: true, age: 45, sex: "male", symptoms: ["low_back"] });
  });
  it("完了：姿勢・体幹年齢・項目ごとの年齢・スコア・ランクを追加", () => {
    const answers: Answers = { plank: { status: "answered", value: 70 }, legs: { status: "answered", value: 27 } };
    const result = calculateResult(answers);
    const bodyAge = estimateBodyAge(answers, "male", 45);
    const b = buildTally("complete", state, result, bodyAge);
    expect(b.body_age).toBe(bodyAge!.age);
    expect(b.item_ages).toEqual({ plank: 40, legs: 45 });
    expect(b.total_score).toBe(result.total);
    expect(b.rank).toBe(result.rank);
    expect(b.in_line).toBe(false);
  });
  it("個人を特定できる情報（名前・電話）は含めない", () => {
    const keys = Object.keys(buildTally("complete", state, calculateResult({}), null));
    expect(keys.some((k) => /name|phone|mail|line_user/.test(k))).toBe(false);
  });
});
