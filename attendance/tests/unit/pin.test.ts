import { describe, expect, it } from "vitest";
import { generatePin, isAcceptablePin } from "@/lib/kiosk/pin";
import { allowedPunches } from "@/lib/kiosk/protocol";

describe("PIN", () => {
  it("推測しやすいPINを拒否する（DBと同じ規則）", () => {
    for (const pin of ["1234", "4321", "000000", "123456", "987654", "12a4", "123"]) expect(isAcceptablePin(pin)).toBe(false);
    for (const pin of ["482916", "1357", "90210"]) expect(isAcceptablePin(pin)).toBe(true);
  });

  it("発行するPINは6桁で、規則を満たす", () => {
    for (let i = 0; i < 200; i++) {
      const pin = generatePin();
      expect(pin).toHaveLength(6);
      expect(isAcceptablePin(pin)).toBe(true);
    }
  });
});

describe("打刻ボタン", () => {
  it("状態に応じて押せる打刻が決まる（休憩中は休憩終了のみ）", () => {
    expect(allowedPunches("off")).toEqual(["clock_in"]);
    expect(allowedPunches("working")).toEqual(["break_start", "clock_out"]);
    expect(allowedPunches("on_break")).toEqual(["break_end"]);
  });
});
