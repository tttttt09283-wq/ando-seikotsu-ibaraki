import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { cp932Unmappable, encodeCsv, renderExport, sanitizeCell, toCsv, toHours } from "@/lib/export/format";

const table = {
  title: "全院月次勤怠一覧",
  headers: ["院", "氏名", "実労働（時間）", "備考"],
  rows: [
    ["茨木院", "髙橋　﨑子", 160.5, "通常"],
    ["香里園院", "安藤 太郎", 8, '改行\nと"引用符",カンマ'],
    ["枚方本院", "=HYPERLINK(\"x\")", -1.25, null],
  ],
};

describe("CSV 出力", () => {
  it("CRLF 改行・必要なセルだけ引用符で囲む", () => {
    expect(toCsv(table)).toBe(
      "院,氏名,実労働（時間）,備考\r\n" +
        "茨木院,髙橋　﨑子,160.5,通常\r\n" +
        '香里園院,安藤 太郎,8,"改行\nと""引用符"",カンマ"\r\n' +
        "枚方本院,\"'=HYPERLINK(\"\"x\"\")\",-1.25,\r\n",
    );
  });

  it("数式として実行される文字列の先頭に ' を付ける（数値の負数はそのまま）", () => {
    expect(sanitizeCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCell("+81")).toBe("'+81");
    expect(sanitizeCell("-")).toBe("'-");
    expect(sanitizeCell("@SUM")).toBe("'@SUM");
    expect(sanitizeCell(-3)).toBe("-3");
    expect(sanitizeCell("安藤")).toBe("安藤");
  });

  it("UTF-8 は BOM 付きで、文字化けせずに読み戻せる", () => {
    const bytes = encodeCsv(toCsv(table), "utf8");
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8").decode(bytes)).toBe(toCsv(table)); // TextDecoder は BOM を取り除く
  });

  it("Shift_JIS（CP932）は Excel と同じ文字コードで、機種依存文字（髙・﨑・①・㈱）も文字化けしない", async () => {
    const text = toCsv({ headers: ["氏名", "備考"], rows: [["髙橋　﨑子", "①㈱～－"]] });
    const bytes = encodeCsv(text, "sjis");
    expect(new TextDecoder("shift_jis").decode(bytes)).toBe(text);
    // Shift_JIS のバイト列で書かれている（「あ」= 0x82 0xA0、「茨」= 0x88 0xEF）
    expect([...encodeCsv("あ茨", "sjis")]).toEqual([0x82, 0xa0, 0x88, 0xef]);
    const csv = await renderExport(table, "csv_sjis");
    expect(new TextDecoder("shift_jis").decode(csv)).toContain("髙橋　﨑子,160.5");
  });

  it("Shift_JIS で表せない文字を検出できる", () => {
    expect(cp932Unmappable("安藤 太郎")).toEqual([]);
    expect(cp932Unmappable("𠮷野😀さん")).toEqual(["𠮷", "😀"]);
  });

  it("分を時間（小数2桁）にする", () => {
    expect(toHours(90)).toBe(1.5);
    expect(toHours(100)).toBe(1.67);
    expect(toHours(null)).toBe(0);
  });
});

describe("Excel 出力", () => {
  it("見出し・数値・日本語をそのまま保存し、数式は文字列として保存する", async () => {
    const buffer = await renderExport(table, "xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("全院月次勤怠一覧");
    expect(ws.getRow(1).values).toEqual([undefined, "院", "氏名", "実労働（時間）", "備考"]);
    expect(ws.getCell("B2").value).toBe("髙橋　﨑子");
    expect(ws.getCell("C2").value).toBe(160.5);
    expect(ws.getCell("B4").value).toBe("'=HYPERLINK(\"x\")");
    expect(ws.getCell("D4").value).toBeNull();
  });
});
