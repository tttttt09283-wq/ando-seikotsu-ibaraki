// 初期PASSの発行（読み間違えやすい 0/O・1/l/I は使わない）
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const ALL = LOWER + UPPER + DIGIT;

export const PASSWORD_MIN = 8;

function pick(chars: string, rand: (n: number) => number) {
  return chars[rand(chars.length)];
}

// 暗号論的乱数で、英小文字・英大文字・数字を必ず1つ以上含む
export function generateInitialPassword(length = 10, rand: (n: number) => number = secureRandomInt): string {
  if (length < PASSWORD_MIN) throw new Error(`PASSは${PASSWORD_MIN}文字以上にしてください`);
  const chars = [pick(LOWER, rand), pick(UPPER, rand), pick(DIGIT, rand)];
  while (chars.length < length) chars.push(pick(ALL, rand));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// 本人が決めるPASSの条件
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `PASSは${PASSWORD_MIN}文字以上にしてください`;
  if (pw.length > 72) return "PASSは72文字以内にしてください";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "PASSには英字と数字を両方入れてください";
  return null;
}

export function secureRandomInt(n: number): number {
  const max = Math.floor(0x100000000 / n) * n; // 偏りを無くす
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) return buf[0] % n;
  }
}
