import { describe, expect, it } from "vitest";
import { latestMonthSheet, nameKey, parseSheetMonthEnd, parseSnapshotTable, planSnapshotGrants } from "@/lib/leave/snapshot";

const fullTime = { weeklyDays: 5, weeklyMinutes: 2400 };

// 出勤簿（残業代計算表）と同じ並び：タイトル行 → 注記行 → 空行 → 見出し行（先頭は人数）→ 1人1行
const SHEET = [
  ["残業代計算表", "R", null, null, 8, "年", 6, "月"],
  [null, null, null, null, "※欠勤に関しては…"],
  [],
  [36, "出勤日数", "別バイト\n別MG業", "休日\n(バイト等含)", "有休", "有給残", "特休", "欠勤控除"],
  ["安藤　太郎", 18, 0, 10, 2, 18, 0, 0],
  ["山田　花子", 18.5, 0, 8, 3.5, 19, 0, 0],
  [null, null, null, null, null, null],
  ["業務委託　一郎(個)", 21, null, null, null, null],
  ["佐藤　次郎", 9, 0, 0, 0, "七", 0, 0],
];

describe("月末残数形式（出勤簿）の取込", () => {
  it("見出しの「有給残」を見つけ、氏名と残日数を読み取る（空欄の人は対象外）", () => {
    const { rows, issues } = parseSnapshotTable(SHEET);
    expect(rows).toEqual([
      { row: 5, name: "安藤　太郎", nameKey: "安藤太郎", remaining_days: 18 },
      { row: 6, name: "山田　花子", nameKey: "山田花子", remaining_days: 19 },
    ]);
    expect(issues).toEqual([
      { row: 8, level: "warn", message: "業務委託　一郎(個)：有給残が空欄のため対象外にしました" },
      { row: 9, level: "error", message: "佐藤　次郎：有給残「七」は0.5日単位の数値ではありません" },
    ]);
  });

  it("氏名の照合は空白・全角半角・末尾の括弧書きを無視する", () => {
    expect(nameKey("安藤　太郎")).toBe(nameKey("安藤 太郎"));
    expect(nameKey("谷野　遼太(個)")).toBe("谷野遼太");
    expect(nameKey("ＡＢＣ　花子")).toBe("ABC花子");
  });

  it("シート名から対象月の末日を読み取り、最新月のシートを選ぶ", () => {
    expect(parseSheetMonthEnd("R8.6")).toBe("2026-06-30");
    expect(parseSheetMonthEnd("令和8年2月")).toBe("2026-02-28");
    expect(parseSheetMonthEnd("2026年11月")).toBe("2026-11-30");
    expect(parseSheetMonthEnd("Sheet1")).toBeNull();
    expect(latestMonthSheet(["R8.4", "R8.5", "R8.12", "R8.6", "集計"])).toBe("R8.12");
    expect(latestMonthSheet(["R7.12", "R8.1"])).toBe("R8.1");
  });

  it("残数を入社日から推定した直近2回の付与に振り分ける", () => {
    // 入社 2024-04-01：2024-10-01 に10日、2025-10-01 に11日
    expect(planSnapshotGrants("2024-04-01", fullTime, "2026-06-30", 18)).toEqual({
      grants: [
        { grant_date: "2024-10-01", days: 7, expiration_date: "2026-09-30" },
        { grant_date: "2025-10-01", days: 11, expiration_date: "2027-09-30" },
      ],
      warning: null,
    });
    // 残が直近の付与日数以下なら、すべて直近の付与
    expect(planSnapshotGrants("2024-04-01", fullTime, "2026-06-30", 8.5).grants).toEqual([
      { grant_date: "2025-10-01", days: 8.5, expiration_date: "2027-09-30" },
    ]);
    // 法定日数を超える残（独自付与など）は直近の付与に含めて知らせる
    expect(planSnapshotGrants("2024-04-01", fullTime, "2026-06-30", 25).warning).toContain("4日");
    // 入社6か月前は推定できない
    expect(planSnapshotGrants("2026-03-01", fullTime, "2026-06-30", 2).warning).toContain("推定できません");
  });
});
