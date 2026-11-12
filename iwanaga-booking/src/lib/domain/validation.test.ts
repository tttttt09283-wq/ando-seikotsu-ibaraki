import { describe, expect, it } from "vitest";
import { findGuaranteeExpression, normalizePhone, validateReservationInput } from "./validation";
import { input } from "@/test/fixtures";

describe("予約フォームの入力検証", () => {
  it("正しい入力は通る（電話番号は正規化される）", () => {
    const r = validateReservationInput(input({ service_id: "s1", phone: "０９０－１２３４－５６７８" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.phone).toBe("09012345678");
  });

  it("個人情報の取扱い・キャンセル規定への同意は必須", () => {
    const r = validateReservationInput(input({ service_id: "s1", agree_privacy: false, agree_cancel_policy: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.agree_privacy).toContain("同意");
      expect(r.errors.agree_cancel_policy).toContain("同意");
    }
  });

  it("文字列の 'true' では同意とみなさない", () => {
    const r = validateReservationInput(input({ service_id: "s1", agree_privacy: "true" }));
    expect(r.ok).toBe(false);
  });

  it("必須項目（施術場所・メニュー・日時・氏名・電話）", () => {
    const r = validateReservationInput({ agree_privacy: true, agree_cancel_policy: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["location_id", "service_id", "date", "time", "name", "phone"]));
  });

  it("電話番号の形式", () => {
    for (const bad of ["1234", "9012345678", "090-1234-56789-0", "abc"]) {
      const r = validateReservationInput(input({ service_id: "s1", phone: bad }));
      expect(r.ok, bad).toBe(false);
    }
    expect(normalizePhone("(06) 1234-5678")).toBe("0612345678");
  });

  it("相談内容は任意・200文字まで（症状の詳細を集めすぎない）", () => {
    expect(validateReservationInput(input({ service_id: "s1", consultation: undefined })).ok).toBe(true);
    const r = validateReservationInput(input({ service_id: "s1", consultation: "あ".repeat(201) }));
    expect(r.ok).toBe(false);
  });

  it("氏名の制御文字は除去・空白だけは不可", () => {
    expect(validateReservationInput(input({ service_id: "s1", name: "   " })).ok).toBe(false);
    const r = validateReservationInput(input({ service_id: "s1", name: "山田\u0000花子" }));
    expect(r.ok && r.data.name).toBe("山田花子");
  });

  it("日付・時刻の形式", () => {
    expect(validateReservationInput(input({ service_id: "s1", date: "2026/11/16" })).ok).toBe(false);
    expect(validateReservationInput(input({ service_id: "s1", time: "10時" })).ok).toBe(false);
  });

  it("医療効果の保証表現を検出する", () => {
    expect(findGuaranteeExpression("必ず治ります")).not.toBeNull();
    expect(findGuaranteeExpression("全身の鍼灸施術")).toBeNull();
  });
});
