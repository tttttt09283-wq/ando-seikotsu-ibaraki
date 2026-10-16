import { describe, expect, it } from "vitest";
import { TENANT } from "@/tenant";
import { parseBusinessPlan } from "./business-plan";
import { parseCsv } from "./csv";
import { parseDailyReport } from "./daily-report";
import { extractGid, extractSpreadsheetId } from "./google-sheets-url";
import { normalizeLabel, parseNumberCell } from "./normalize";

const opts = { clinics: TENANT.clinics, metrics: TENANT.metrics, totalRowAliases: TENANT.totalRowAliases };

describe("数値・見出しの正規化", () => {
  it("¥・カンマ・%・マイナス・全角を数値にする", () => {
    expect(parseNumberCell("¥9,661,886")).toBe(9661886);
    expect(parseNumberCell("-¥310,962")).toBe(-310962);
    expect(parseNumberCell("¥-310,962")).toBe(-310962);
    expect(parseNumberCell("▲1,000")).toBe(-1000);
    expect(parseNumberCell("96.78%")).toBe(96.78);
    expect(parseNumberCell("１，２３４")).toBe(1234);
    expect(parseNumberCell("")).toBeUndefined();
    expect(parseNumberCell("#DIV/0!")).toBeUndefined();
    expect(parseNumberCell("岩永")).toBeUndefined();
  });
  it("見出しの改行・全角括弧・空白をそろえる", () => {
    expect(normalizeLabel("巻き爪\n（新規）")).toBe("巻き爪(新規)");
    expect(normalizeLabel("Google\n口コミ")).toBe("google口コミ");
  });
});

describe("日計表（TOPシート）", () => {
  const csv = [
    ",,,,基準：2500",
    ',"2026. 10月分",,,単価,累計目標,累計実績,差,達成率,目標売上,着地予想,差,達成率,レセ枚数,"平均来院数",新患数,再診数,今月初,総来院数,"巻き爪\n（新規）","巻き爪\n（継続）","巻き爪\n（売上）",自賠新規,自賠今月初,自賠継続,自賠売上,"Google\n口コミ","HPB\n口コミ",月間LTV,キャンセル数,キャンセル率,返金分マイナス',
    ',全院,,岩永,"¥2,090","¥9,661,886","¥9,350,924","-¥310,962",96.78%,"¥25,250,000","¥24,448,207","-¥801,793",96.82%,977,32,75,21,881,"2,659",12,90,"1,316,280",0,7,39,"152,017",16,0,"9,646",299,10.1%,0',
    ',田口山院,,,"¥2,000",,"¥1,200,000",,,"¥3,450,000","¥3,300,000",,,,,8,,,300,3,40,"600,000",,,,,2,,,40,9.0%,',
    ',メモ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ].join("\n");

  it("見出しから指標を特定し、全院・院の行を取り込む", () => {
    const r = parseDailyReport(parseCsv(csv), opts);
    expect(r.rows.map((x) => x.clinicId)).toEqual(["all", "taguchiyama"]);
    const all = r.rows[0].values;
    expect(all.salesActual).toBe(9350924);
    expect(all.salesTarget).toBe(25250000);
    expect(all.salesForecast).toBe(24448207);
    expect(all.monthFirst).toBe(881);
    expect(all.jibaiMonthFirst).toBe(7); // 「今月初」と取り違えない
    expect(all.makiNew).toBe(12);
    expect(all.makiSales).toBe(1316280);
    expect(all.googleReviews).toBe(16);
    expect(all.hpbReviews).toBe(0);
    expect(all.cancelRate).toBe(10.1);
    expect(all.ltv).toBe(9646);
    expect(r.metrics.length).toBeGreaterThanOrEqual(24);
    expect(r.rows[1].values.makiCont).toBe(40);
  });

  it("見出しがない表はエラー内容を返す", () => {
    expect(parseDailyReport([["a", "b"], ["1", "2"]], opts).warnings[0]).toContain("見出し行");
  });
});

describe("事業計画書", () => {
  it("院の売上計画と損益の行を、期首から年月に割り当てる", () => {
    const grid = parseCsv(
      [
        "株式会社 Enejoy Hand,事業計画書,,,,,,,令和8年7月〜",
        "科目/月,7月,8月,9月,10月,11月,12月,1月",
        '本院,"3,481,510","3,587,895","3,300,000","3,400,000",,,"3,500,000"',
        '田口山院 巻き爪,"3,332,909","2,933,477","3,450,000","3,700,000",,,',
        '香里園院　10月,0,0,0,"3,000,000",,,',
        "調整,0,0,0,,,,",
        '売上合計,"21,824,618","20,792,497","20,100,000","24,350,000",,,',
        '売上総利益,"21,417,018","20,685,209","19,770,000","24,020,000",,,',
        '人件費増加【中途採用2名】,0,0,"560,000","560,000",,,',
      ].join("\n"),
    );
    const r = parseBusinessPlan(grid, { clinics: TENANT.clinics, fromMonth: "2026-07" });
    expect(r.months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(r.clinicRows).toBe(3);
    expect(r.records.find((x) => x.clinicId === "honin" && x.month === "2027-01")?.amountJpy).toBe(3500000);
    expect(r.records.find((x) => x.clinicId === "korien" && x.month === "2026-10")?.amountJpy).toBe(3000000);
    expect(r.records.find((x) => x.label === "売上合計" && x.month === "2026-07")?.amountJpy).toBe(21824618);
    expect(r.records.some((x) => x.label.startsWith("人件費増加"))).toBe(true);
  });
});

describe("スプレッドシートのURL", () => {
  it("IDとタブ番号を取り出す", () => {
    const url = "https://docs.google.com/spreadsheets/d/1dM6Xrv0YjHC26QuF5wAKunaXve0JT0rQQfoGN_QbzDY/edit?usp=sharing#gid=123";
    expect(extractSpreadsheetId(url)).toBe("1dM6Xrv0YjHC26QuF5wAKunaXve0JT0rQQfoGN_QbzDY");
    expect(extractGid(url)).toBe("123");
    expect(extractSpreadsheetId("https://example.com")).toBeNull();
  });
});
