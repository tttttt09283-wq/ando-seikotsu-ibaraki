import { describe, expect, it } from "vitest";
import { CsvFileError, decodeCsv, parseCsv, CSV_MAX_ROWS } from "@/lib/csv/decode";
import { validateAppointmentCsv, validateCustomerCsv, validateVisitCsv, type ImportContext } from "@/lib/csv/import";
import { escapeCsvCell, toCsv } from "@/lib/csv/export";

const enc = (s: string) => new TextEncoder().encode(s);
const ctx: ImportContext = {
  defaultStoreId: "s1",
  allowedStores: [{ id: "s1", code: "HQ" }],
  allStores: [
    { id: "s1", code: "HQ" },
    { id: "s2", code: "EKI" },
  ],
  staffByEmail: new Map([["staff@example.com", "u1"]]),
};
const parse = (text: string) => parseCsv(decodeCsv(enc(text)));

describe("decodeCsv：ファイル検証", () => {
  it("UTF-8（BOM 付き）を読める", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("姓\nテスト")]);
    expect(decodeCsv(bytes)).toBe("姓\nテスト");
  });

  it("Shift_JIS を読める", () => {
    // 「姓」= 0x90 0xA9（Shift_JIS）
    const bytes = new Uint8Array([0x90, 0xa9, 0x0a, 0x41]);
    expect(decodeCsv(bytes)).toBe("姓\nA");
  });

  it("空ファイル・巨大ファイル・バイナリを拒否する", () => {
    expect(() => decodeCsv(new Uint8Array())).toThrow(CsvFileError);
    expect(() => decodeCsv(new Uint8Array(5 * 1024 * 1024 + 1).fill(0x41))).toThrow(/5MB/);
    expect(() => decodeCsv(new Uint8Array([0x50, 0x4b, 0x03, 0x00]))).toThrow(/バイナリ/);
  });

  it("行数上限を超えると拒否する", () => {
    const text = "姓\n" + Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `テスト${i}`).join("\n");
    expect(() => parse(text)).toThrow(/上限/);
  });

  it("ヘッダーの重複を拒否する", () => {
    expect(() => parse("姓,姓\nA,B")).toThrow(/重複/);
  });
});

describe("validateCustomerCsv：不正データ処理", () => {
  it("必須列が無ければファイル全体をエラーにする", () => {
    expect(() => validateCustomerCsv(parse("名,電話番号\n太郎,0900000000"), ctx)).toThrow(/姓/);
  });

  it("正常行は取り込み、不正行は行番号と列名でエラーにする（値は含めない）", () => {
    const csv = parse(
      [
        "顧客番号,姓,名,電話番号,メールアドレス,店舗コード,連絡同意",
        "A001,テスト,太郎,090-0000-0001,t1@example.com,HQ,同意",
        "A002,,花子,090-0000-0002,,HQ,",
        "A003,テスト,次郎,abc,bad-mail,HQ,はい",
      ].join("\n"),
    );
    const r = validateCustomerCsv(csv, ctx);
    expect(r.total).toBe(3);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ customer_code: "A001", store_id: "s1", consent: "granted" });
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { row: 3, column: "姓", message: "必須です" },
        expect.objectContaining({ row: 4, column: "電話番号" }),
        expect.objectContaining({ row: 4, column: "メールアドレス" }),
        expect.objectContaining({ row: 4, column: "連絡同意" }),
      ]),
    );
    expect(JSON.stringify(r.errors)).not.toMatch(/abc|bad-mail|次郎/);
  });

  it("ファイル内の顧客番号の重複を検出する", () => {
    const r = validateCustomerCsv(parse("顧客番号,姓\nA1,テスト\nA1,テスト"), ctx);
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ row: 3, column: "顧客番号" });
  });

  it("権限外の店舗・存在しない店舗を拒否する", () => {
    const r = validateCustomerCsv(parse("姓,店舗コード\nA,EKI\nB,NOPE"), ctx);
    expect(r.rows).toHaveLength(0);
    expect(r.errors.map((e) => e.message)).toEqual(["この店舗への取込権限がありません", "存在しない店舗コードです"]);
  });

  it("数式として解釈される値（CSV インジェクション）を拒否する", () => {
    const r = validateCustomerCsv(parse('姓,名\n=HYPERLINK("x"),太郎\n@SUM(1),花子\n+1,次郎'), ctx);
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(3);
  });

  it("組織に所属しない担当者メールを拒否する", () => {
    const r = validateCustomerCsv(parse("姓,担当者メール\nA,staff@example.com\nB,nobody@example.com"), ctx);
    expect(r.rows[0].assigned_staff_id).toBe("u1");
    expect(r.errors[0]).toMatchObject({ row: 3, column: "担当者メール" });
  });

  it("長すぎる値を拒否する", () => {
    const r = validateCustomerCsv(parse(`姓\n${"あ".repeat(51)}`), ctx);
    expect(r.errors[0].column).toBe("姓");
  });

  it("引用符・カンマ・改行を含む値を正しく扱う", () => {
    const r = validateCustomerCsv(parse('姓,名\n"テスト, 株式会社","太""郎"'), ctx);
    expect(r.rows[0]).toMatchObject({ family_name: "テスト, 株式会社", given_name: '太"郎' });
  });
});

describe("validateVisitCsv / validateAppointmentCsv", () => {
  it("日付形式・未来日・重複を検証する", () => {
    const r = validateVisitCsv(
      parse("顧客番号,来店日\nA1,2026/11/1\nA1,2026-11-01\nA2,2026-13-01\nA3,2027-01-01"),
      ctx,
      "2026-11-11",
    );
    expect(r.rows).toEqual([{ row: 2, customer_code: "A1", visited_on: "2026-11-01", store_id: "s1", menu_label: null }]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5]);
  });

  it("予約日時を日本時間として解釈する", () => {
    const r = validateAppointmentCsv(parse("顧客番号,予約日時,ステータス\nA1,2026/11/20 9:30,確定\nA2,2026-11-20,"), ctx);
    expect(r.rows[0]).toMatchObject({ scheduled_at: "2026-11-20T09:30:00+09:00", status: "confirmed" });
    expect(r.errors[0]).toMatchObject({ row: 3, column: "予約日時" });
  });
});

describe("CSV エクスポート", () => {
  it("数式インジェクション対策として先頭に ' を付ける", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+81 90")).toBe("'+81 90");
    expect(escapeCsvCell("@x")).toBe("'@x");
    expect(escapeCsvCell("通常")).toBe("通常");
  });

  it("カンマ・引用符・改行をエスケープし、BOM を付ける", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'q"q'], [null, "改\n行"]]);
    expect(csv).toBe('﻿a,b\r\n"x,y","q""q"\r\n,"改\n行"\r\n');
  });
});
