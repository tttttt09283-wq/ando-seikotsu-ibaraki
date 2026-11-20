// 個人ID・個人PASSのログイン（2026-11-17 から）
import test from "node:test";
import assert from "node:assert/strict";
process.env.PIN_SESSION_SECRET = process.env.PIN_SESSION_SECRET || "test-secret";
const {
  randomPassword, isPersonPassword, samePassword, nextPersonId, parseLoginSheet, planPersonLogins, LOGIN_HEADER, PASS_LENGTH,
  issueToken, verifyToken, pinStamp, PERSON_PASS_MODE,
} = await import("../lib/pin-auth.js");

test("個人PASS：英小文字と数字の8文字。読み間違えやすい文字（i・l・o・0・1）は使わない", () => {
  assert.equal(PERSON_PASS_MODE, "password");
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const p = randomPassword();
    assert.equal(p.length, PASS_LENGTH);
    assert.match(p, /^[a-hj-km-np-z2-9]{8}$/);
    assert.ok(/[a-z]/.test(p) && /\d/.test(p));
    seen.add(p);
  }
  assert.ok(seen.size > 290, "毎回ちがう");
});

test("個人PASSの比較：同じ8文字だけ通る（前後の空白は無視）。4桁や名字は通らない", () => {
  assert.equal(samePassword("ab3defg4", "ab3defg4"), true);
  assert.equal(samePassword("ab3defg4", " ab3defg4 "), true);
  assert.equal(samePassword("ab3defg4", "AB3DEFG4"), false);
  assert.equal(samePassword("ab3defg4", "ab3defg"), false);
  assert.equal(samePassword("1234", "1234"), false, "以前の4桁は使えない");
  assert.equal(samePassword("", ""), false);
  assert.equal(isPersonPassword("1234"), false);
});

test("個人ID：主な院の院ID＋2けたの番号。使われている番号は飛ばす", () => {
  assert.equal(nextPersonId("香里園", 0, new Set()), "korien01");
  assert.equal(nextPersonId("香里園", 0, new Set(["korien01", "korien02"])), "korien03");
  assert.equal(nextPersonId("新しい院", 7, new Set()), "clinic801");
});

const sheetRows = [
  LOGIN_HEADER,
  ["院", "香里園", "korien", "", "4821", "0", "", ""],
  ["個人", "香里園", "korien01", "山田 太郎", "ab3defg4", "0", "", ""],   // 作成済み
  ["個人", "香里園", "", "佐藤 花子", "5821", "0", "", ""],              // 以前の4桁（IDなし）
  ["個人", "茨木", "ibaraki01", "鈴木 一郎", "", "0", "", ""],           // IDはあるがPASSが空
];

test("ログイン設定シート：個人IDで本人を探せる。以前の4桁・空のPASSの人はまだ使えない", () => {
  const s = parseLoginSheet(sheetRows);
  assert.equal(s.clinics.get("香里園").pin, "4821");
  assert.deepEqual([...s.byId.keys()], ["korien01"]);
  assert.equal(s.byId.get("korien01").name, "山田 太郎");
  assert.equal(s.people.get("佐藤花子").pin, "5821");
});

test("まとめて作成：作成済みの人は変えず、4桁・空・行の無い人に作る。IDは院ごとに続き番号", () => {
  const s = parseLoginSheet(sheetRows);
  const people = [
    { key: "山田太郎", name: "山田 太郎", clinics: ["香里園"] },
    { key: "佐藤花子", name: "佐藤 花子", clinics: ["香里園"] },
    { key: "鈴木一郎", name: "鈴木 一郎", clinics: ["茨木"] },
    { key: "田中次郎", name: "田中 次郎", clinics: ["香里園", "茨木"] },
  ];
  const plan = planPersonLogins(s, people, ["香里園", "茨木"]);
  assert.deepEqual(plan.map((x) => [x.person.key, x.id, !!x.entry]), [
    ["佐藤花子", "korien02", true],
    ["鈴木一郎", "ibaraki01", true],
    ["田中次郎", "korien03", false],
  ]);
  assert.ok(plan.every((x) => isPersonPassword(x.pass)));
  assert.equal(new Set(plan.map((x) => x.pass)).size, 3);
});

test("ログインの印：PASSを再発行すると古い印は使えない（PASSから作った短い印で判定）", () => {
  const token = issueToken({ t: "person", k: "山田太郎", n: "山田 太郎", h: pinStamp("ab3defg4") });
  const t = verifyToken(token);
  assert.equal(t.h, pinStamp("ab3defg4"));
  assert.notEqual(t.h, pinStamp("zz9yy8xx"));
  assert.equal(verifyToken(token + "x"), null);
});
