import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("server-only", () => ({}));

describe("取込ファイルの読み込み", () => {
  it("xlsx の日付セル・数式セルを読み込める", async () => {
    const { readSpreadsheet } = await import("@/lib/leave/import-file");
    const { parseLeaveTable } = await import("@/lib/leave/import");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("有給");
    ws.addRow(["社員番号", "氏名", "付与日", "付与日数", "取得日数", "残日数"]);
    ws.addRow(["1001", "安藤 太郎", new Date(Date.UTC(2025, 9, 1)), 11, 3, { formula: "D2-E2", result: 8 }]);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const table = await readSpreadsheet(new File([buf], "有給管理.xlsx"));
    expect(parseLeaveTable(table).rows).toEqual([
      { row: 2, staff_code: "1001", name: "安藤 太郎", grant_date: "2025-10-01", granted_days: 11, taken_days: 3, expiration_date: null },
    ]);
  });

  it("Shift_JIS・UTF-8（BOM付き）の CSV を読み込める", async () => {
    const { readSpreadsheet } = await import("@/lib/leave/import-file");
    const csv = 'スタッフID,付与日,付与日数,残日数\r\n1001,2025/10/01,11,"8"\r\n';
    const utf8 = new File(["﻿" + csv], "a.csv");
    expect((await readSpreadsheet(utf8))[1]).toEqual(["1001", "2025/10/01", "11", "8"]);
    // Shift_JIS でエンコードした「スタッフID」の見出し
    const sjisHeader = Uint8Array.from([0x83, 0x58, 0x83, 0x5e, 0x83, 0x62, 0x83, 0x74, 0x49, 0x44]);
    const sjis = new File([sjisHeader, ",x\r\n"], "b.csv");
    expect((await readSpreadsheet(sjis))[0][0]).toBe("スタッフID");
  });

  it("古い .xls と大きすぎるファイルは断る", async () => {
    const { readSpreadsheet } = await import("@/lib/leave/import-file");
    await expect(readSpreadsheet(new File(["x"], "old.xls"))).rejects.toThrow(/xlsx/);
    await expect(readSpreadsheet(new File([new Uint8Array(6 * 1024 * 1024)], "big.xlsx"))).rejects.toThrow(/5MB/);
  });
});
