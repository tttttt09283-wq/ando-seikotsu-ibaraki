import { describe, expect, it } from "vitest";
import { appSourceFromUa, buildTally, isInLine, readRef, readSource } from "./tally";
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

describe("appSourceFromUa（Instagram・Threadsのアプリ内か）", () => {
  it("アプリのブラウザを見分ける", () => {
    expect(appSourceFromUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0.0")).toBe("instagram");
    expect(appSourceFromUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Barcelona 330.0.0")).toBe("threads");
    expect(appSourceFromUa("Mozilla/5.0 (iPhone) Safari/604.1")).toBeNull();
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
    expect(b).toEqual({ session_id: state.sessionId, event: "start", source: "line", in_line: true, nickname: null, share_code: state.sessionId.replace(/-/g, "").slice(0, 10), referred_by: null, age: 45, sex: "male", symptoms: ["low_back"] });
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
  it("電話・メール・LINEのアカウントは含めない（お名前は任意のニックネームだけ）", () => {
    const keys = Object.keys(buildTally("complete", state, calculateResult({}), null));
    expect(keys.some((k) => /phone|mail|line_user|patient_name/.test(k))).toBe(false);
  });
  it("シェアから来た人：紹介コードを送り、どこからは share", () => {
    const b = buildTally("start", { ...state, source: null, ref: "abc12345", profile: { ...state.profile, nickname: "はなこ" } });
    expect(b.referred_by).toBe("abc12345");
    expect(b.source).toBe("share");
    expect(b.nickname).toBe("はなこ");
  });
  it("紹介コードの読み取りは英小文字・数字の6〜16文字だけ", () => {
    expect(readRef("?ref=ABC12345")).toBe("abc12345");
    expect(readRef("?ref=ab")).toBeNull();
    expect(readRef("?ref=abc-123456")).toBeNull();
  });
});
