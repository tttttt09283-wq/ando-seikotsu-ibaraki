import { describe, expect, it } from "vitest";
import { detectHeader, parseDateCell, parseDaysCell, parseLeaveTable } from "@/lib/leave/import";

describe("有給残数の取込：セルの読み取り", () => {
  it("さまざまな日付の書き方を YYYY-MM-DD に変換する", () => {
    expect(parseDateCell(new Date(Date.UTC(2025, 9, 1)))).toBe("2025-10-01");
    expect(parseDateCell(45931)).toBe("2025-10-01"); // Excel のシリアル値
    expect(parseDateCell("2025/10/1")).toBe("2025-10-01");
    expect(parseDateCell("２０２５年１０月１日")).toBe("2025-10-01");
    expect(parseDateCell("令和7年10月1日")).toBe("2025-10-01");
    expect(parseDateCell("R7.10.1")).toBe("2025-10-01");
    expect(parseDateCell("令和元年5月1日")).toBe("2019-05-01");
    expect(parseDateCell("2025/02/30")).toBeNull();
    expect(parseDateCell("来月")).toBeNull();
  });

  it("日数は「10日」「１０．５」なども数値にする", () => {
    expect(parseDaysCell("10日")).toBe(10);
    expect(parseDaysCell("１０．５")).toBe(10.5);
    expect(parseDaysCell("")).toBeNull();
    expect(parseDaysCell("たくさん")).toBe("invalid");
  });

  it("見出しの表記ゆれを吸収し、タイトル行があっても見出し行を見つける", () => {
    const h = detectHeader([["有給休暇管理表 2026年10月"], [], ["社員番号", "氏名", "付与年月日", "付与数", "使用日数", "残数", "期限"]]);
    expect(h).toEqual({ headerRow: 2, columns: { staff_code: 0, name: 1, grant_date: 2, granted_days: 3, taken_days: 4, remaining_days: 5, expiration_date: 6 } });
  });
});

describe("有給残数の取込：表の検証", () => {
  it("取得済み日数がなければ残日数から計算し、両方あれば突き合わせる", () => {
    const { rows, issues } = parseLeaveTable([
      ["スタッフID", "氏名", "付与日", "付与日数", "取得済み日数", "残日数", "有効期限"],
      ["1001", "安藤 太郎", "2025/10/01", 11, 3, 8, "2027/09/30"],
      [1002, "山田 花子", "2025/04/01", 10, "", 7.5, ""],
      ["1003", "佐藤 次郎", "2025/04/01", 10, 2, 7, ""],
      [],
      [12, "鈴木 一郎", "2025/04/01", 10, 0, "", ""],
    ]);
    expect(rows).toEqual([
      { row: 2, staff_code: "1001", name: "安藤 太郎", grant_date: "2025-10-01", granted_days: 11, taken_days: 3, expiration_date: "2027-09-30" },
      { row: 3, staff_code: "1002", name: "山田 花子", grant_date: "2025-04-01", granted_days: 10, taken_days: 2.5, expiration_date: null },
      { row: 6, staff_code: "0012", name: "鈴木 一郎", grant_date: "2025-04-01", granted_days: 10, taken_days: 0, expiration_date: null },
    ]);
    expect(issues).toEqual([
      { row: 4, level: "error", message: "付与10日 − 取得2日 ≠ 残7日です" },
      { row: 6, level: "warn", message: "スタッフIDを「0012」として読み込みました（先頭の0を補完）" },
    ]);
  });

  it("必須項目の不足・同じ付与の重複・日数の誤りをエラーにする", () => {
    const { rows, issues } = parseLeaveTable([
      ["スタッフID", "付与日", "付与日数", "取得日数"],
      ["1001", "2025/10/01", 10.3, 0],
      ["1002", "不明", 10, 0],
      ["1003", "2025/10/01", 10, 11],
      ["1004", "2025/10/01", 10, 0],
      ["1004", "2025-10-01", 10, 1],
    ]);
    expect(rows.map((r) => r.row)).toEqual([5]);
    expect(issues.map((i) => i.row)).toEqual([2, 3, 4, 6]);
    expect(issues.find((i) => i.row === 6)?.message).toBe("5行目と同じスタッフ・付与日です");
  });

  it("見出しがない表はエラー", () => {
    expect(parseLeaveTable([["a", "b"], ["1", "2"]]).issues[0].message).toContain("見出し行が見つかりません");
  });
});
