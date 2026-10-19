import { randomInt } from "node:crypto";

/** DB の app.assert_valid_pin と同じ規則：4〜8桁の数字。同じ数字の繰り返し・連番は不可 */
export function isAcceptablePin(pin: string): boolean {
  if (!/^[0-9]{4,8}$/.test(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return false;
  if ("01234567890".includes(pin) || "09876543210".includes(pin)) return false;
  return true;
}

/** 本部がPINを発行するときのランダムな6桁 */
export function generatePin(length = 6): string {
  for (;;) {
    const pin = Array.from({ length }, () => randomInt(0, 10)).join("");
    if (isAcceptablePin(pin)) return pin;
  }
}
