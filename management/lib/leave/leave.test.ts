import { describe, expect, test } from "vitest";
import { parseCsv, rowsToRecords, decodeCsvBytes, parseDate, parseDays, csvCell } from "../csv";
import { addMonths, endOfMonth } from "../dates";
import { grantDateOf, statutoryDays, upcomingGrants, isProportional } from "./entitlement";
import { validateBalanceRecords, BALANCE_TEMPLATE, summarizeBalance } from "./import-balance";
import { validateStaffRecords, STAFF_TEMPLATE, matchStore } from "../import-staff";
import { leaveTypeFromLabel } from "./types";

describe("CSV", () => {
  test("ダブルクォート・カンマ・改行を含む値", () => {
    expect(parseCsv('a,b\r\n"x,y","改\n行"\r\n"引用""符",\r\n\r\n')).toEqual([["a", "b"], ["x,y", "改\n行"], ['引用"符', ""]]);
  });
  test("見出しの空白を無視し、Excelと同じ行番号を付ける", () => {
    const { headers, records } = rowsToRecords(parseCsv("スタッフ ID,氏名\nA001, 田中 \n"));
    expect(headers).toEqual(["スタッフID", "氏名"]);
    expect(records).toEqual([{ rowNo: 2, values: { スタッフID: "A001", 氏名: "田中" } }]);
  });
  test("UTF-8（BOM付き）と Shift_JIS（Excel保存）を読める", () => {
    expect(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("有給")]))).toEqual({ text: "有給", encoding: "utf-8" });
    // 「有給」の Shift_JIS
    expect(decodeCsvBytes(new Uint8Array([0x97, 0x4c, 0x8b, 0x8b]))).toEqual({ text: "有給", encoding: "shift_jis" });
  });
  test("日付・日数の表記ゆれ", () => {
    expect(parseDate("2026/4/1")).toBe("2026-04-01");
    expect(parseDate("２０２６年４月１日")).toBe("2026-04-01");
    expect(parseDate("2026/2/30")).toBeNull();
    expect(parseDays("７．５")).toBe(7.5);
    expect(parseDays("3日")).toBe(3);
    expect(parseDays("-1")).toBeNull();
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});

describe("日付", () => {
  test("月末をまたぐ月の足し算・月末", () => {
    expect(addMonths("2025-08-31", 6)).toBe("2026-02-28");
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });
});

describe("有給の法定付与（入社日基準）", () => {
  test("入社6か月後に10日、以後1年ごとに 11・12・14・16・18・20日", () => {
    const w = { hire_date: "2026-04-01" };
    expect(grantDateOf("2026-04-01", 0)).toBe("2026-10-01");
    expect([0, 1, 2, 3, 4, 5, 6, 7, 10].map((i) => statutoryDays(w, i))).toEqual([10, 11, 12, 14, 16, 18, 20, 20, 20]);
  });
  test("比例付与（週4日以下かつ週30時間未満）", () => {
    const w = { hire_date: "2026-04-01", weekly_work_days: 3, weekly_work_hours: 18 };
    expect(isProportional(w)).toBe(true);
    expect([0, 3, 6].map((i) => statutoryDays(w, i))).toEqual([5, 8, 11]);
    expect(isProportional({ hire_date: "2026-04-01", weekly_work_days: 4, weekly_work_hours: 32 })).toBe(false);
  });
  test("期間内の付与予定と年5日の対象", () => {
    expect(upcomingGrants({ hire_date: "2024-04-01" }, "2026-01-01", "2026-12-31")).toEqual([
      { index: 2, grantDate: "2026-10-01", days: 12, proportional: false, countsToward5Day: true },
    ]);
    expect(upcomingGrants({ hire_date: "2026-04-01", weekly_work_days: 2 }, "2026-01-01", "2026-12-31")[0]).toMatchObject({ days: 3, countsToward5Day: false });
    expect(upcomingGrants({ hire_date: null }, "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("残数CSVの検証", () => {
  const ctx = (extra = {}) => ({ today: "2026-11-06", staff: new Map([["A001", { name: "田中 太郎" }]]), alreadyImported: new Set<string>(), ...extra });
  const run = (csv: string, c = ctx()) => { const { headers, records } = rowsToRecords(parseCsv(csv)); return validateBalanceRecords(headers, records, c); };

  test("ひな形はエラーなしで通る", () => {
    const r = run(BALANCE_TEMPLATE);
    expect(r.fileErrors).toEqual([]);
    expect(r.rows.flatMap((x) => x.errors)).toEqual([]);
    expect(r.rows.map((x) => [x.data.type_code, x.data.counts_toward_5day, x.data.prior_taken])).toEqual([["PAID", true, 0], ["PAID", true, 1], ["SHIFT", false, 0], ["SHIFT_HOLIDAY", false, 0]]);
    expect(summarizeBalance(r.rows)).toEqual([{ label: "有給", rows: 2, days: 18.5, people: 1 }, { label: "振替", rows: 1, days: 1, people: 1 }, { label: "祝振替", rows: 1, days: 1, people: 1 }]);
  });
  test("見出しが足りないファイルは行を見ない", () => {
    expect(run("スタッフID,残日数\nA001,3").fileErrors[0]).toMatch(/見出しが足りません：区分・付与日・有効期限/);
  });
  test("行ごとのエラー：未登録の人・区分・日付・0.5刻み・残数＞付与・代休・重複・取り込み済み", () => {
    const csv = [
      "スタッフID,区分,付与日,付与日数,有効期限,残日数",
      "X999,有給,2026/04/01,10,2028/03/31,3",
      "A001,特別休暇,2026/04/01,,2028/03/31,3",
      "A001,有給,2026/04/31,,2028/03/31,3",
      "A001,有給,2026/04/01,10,2028/03/31,3.3",
      "A001,有給,2026/04/01,5,2028/03/31,6",
      "A001,代休,2026/10/01,,2026/10/31,1",
      "A001,振替,2026/11/01,,2026/11/30,1",
      "A001,振替,2026/11/01,,2026/11/30,1",
      "A001,有給,2025/10/01,11,2027/09/30,2",
    ].join("\n");
    const r = run(csv, ctx({ alreadyImported: new Set(["A001|PAID|2025-10-01"]) }));
    const e = r.rows.map((x) => x.errors.join(" "));
    expect(e[0]).toMatch(/X999.*登録されていません/);
    expect(e[1]).toMatch(/区分「特別休暇」/);
    expect(e[2]).toMatch(/付与日が日付/);
    expect(e[3]).toMatch(/0.5日刻み/);
    expect(e[4]).toMatch(/付与日数より多く/);
    expect(e[5]).toMatch(/代休/);
    expect(e[6]).toBe("");
    expect(e[7]).toMatch(/8行目と同じ/);
    expect(e[8]).toMatch(/取り込み済み/);
  });
  test("注意：氏名の違い・法定と違う期限・振休の期限・期限切れ・付与日数なし", () => {
    const csv = [
      "スタッフID,氏名,区分,付与日,付与日数,有効期限,残日数",
      "A001,田中 次郎,有給,2026/04/01,10,2028/04/30,3",
      "A001,,振替,2026/10/03,,2026/10/31,1",
      "A001,,有給,2025/04/01,,2027/03/31,2",
    ].join("\n");
    const w = run(csv).rows.map((x) => x.warnings.join(" "));
    expect(w[0]).toMatch(/氏名が登録と違います.*有効期限が、付与日から2年（2028-03-31）/);
    expect(w[1]).toMatch(/期限を過ぎています（期限切れの振休/);
    expect(w[2]).toMatch(/付与日数が空欄/);
  });
});

describe("スタッフCSVの検証", () => {
  const stores = [{ id: "s1", code: "IBARAKI", name: "茨木院" }, { id: "s2", code: "KATANO", name: "交野院" }, { id: "s3", code: "KORIEN", name: "香里園院" }, { id: "s4", code: "HIRAKATA", name: "枚方本院" }];
  const ctx = (extra = {}) => ({ stores, existingStaffCodes: new Set<string>(), existingLoginIds: new Set<string>(), existingPosIds: new Set<number>(), ...extra });
  const run = (csv: string, c = ctx()) => { const { headers, records } = rowsToRecords(parseCsv(csv)); return validateStaffRecords(headers, records, c); };

  test("店舗名の表記ゆれ", () => {
    expect(matchStore("あんど整骨院 香里園駅前院", stores)?.code).toBe("KORIEN");
    expect(matchStore("枚方", stores)?.code).toBe("HIRAKATA");
    expect(matchStore("korien", stores)?.code).toBe("KORIEN");
    expect(matchStore("大阪院", stores)).toBeNull();
  });
  test("ひな形はエラーなし。複数店舗は先頭が主所属", () => {
    const r = run(STAFF_TEMPLATE);
    expect(r.rows.flatMap((x) => x.errors)).toEqual([]);
    expect(r.rows[1].data.assignments).toEqual([
      { store_id: "s2", store_name: "交野院", role: "STAFF", is_primary: true },
      { store_id: "s1", store_name: "茨木院", role: "STAFF", is_primary: false },
    ]);
  });
  test("店舗ごとに役職を変えられる・社長とGMは店舗なし", () => {
    const r = run("スタッフID,氏名,ログインID,雇用区分,所属店舗,役職\nA1,兼務,kenmu,正社員,交野院;茨木院,院長;一般スタッフ,\nP1,社長,boss,役員,,社長");
    expect(r.rows[0].data.assignments!.map((a) => a.role)).toEqual(["MANAGER", "STAFF"]);
    expect(r.rows[1].data.global_role).toBe("PRESIDENT");
    expect(r.rows.flatMap((x) => x.errors)).toEqual([]);
  });
  test("エラー：重複・既存・BM・店舗不明・数の不一致・雇用区分", () => {
    const csv = [
      "スタッフID,氏名,ログインID,雇用区分,所属店舗,役職",
      "A1,一人目,taro,正社員,茨木院,一般スタッフ",
      "A1,二人目,TARO,正社員,茨木院,一般スタッフ",
      "A3,三人目,jiro,正社員,茨木院,BM",
      "A4,四人目,saburo,正社員,大阪院,院長",
      "A5,五人目,shiro,正社員,交野院;茨木院;香里園院,院長;一般スタッフ",
      "A6,六人目,goro,パート,茨木院,アルバイト",
      "A7,七人目,used,正社員,茨木院,一般スタッフ",
    ].join("\n");
    const e = run(csv, ctx({ existingLoginIds: new Set(["used"]) })).rows.map((x) => x.errors.join(" "));
    expect(e[0]).toBe("");
    expect(e[1]).toMatch(/2行目と同じスタッフID.*2行目と同じログインID/);
    expect(e[2]).toMatch(/BMは担当エリア/);
    expect(e[3]).toMatch(/所属店舗「大阪院」/);
    expect(e[4]).toMatch(/数が合いません/);
    expect(e[5]).toMatch(/雇用区分/);
    expect(e[6]).toMatch(/ログインIDはすでに登録/);
  });
});

test("区分の呼び方", () => {
  expect(["有休", "振休", "祝振替", "代休", "その他"].map(leaveTypeFromLabel)).toEqual(["PAID", "SHIFT", "SHIFT_HOLIDAY", "COMP", null]);
});
