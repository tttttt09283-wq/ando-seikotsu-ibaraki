/**
 * 給与一覧（今の「残業代計算表」と同じ項目の並び）。画面の表と Excel / CSV 出力で共通。
 */
import type { ExportTable } from "@/lib/export/format";
import type { PayType } from "./calc";
import type { PayrollRow } from "./load";

export const PAY_TYPE_LABELS: Record<PayType, string> = { monthly: "月給", hourly: "時給", daily: "日給" };

export const PAYROLL_HEADERS = [
  "院", "スタッフID", "氏名", "給与形態", "出勤日数", "別バイト・別MG業（日）", "休日", "有休（日）", "有給残", "特休", "欠勤（日）",
  "通常（時間）", "うち深夜", "うち法定外休日", "うち法定休日", "有休（時間）", "固定残業数", "超過残業数", "法定時間外（時間）",
  "残業（×1.25 / 時給・日給は×0.25）", "深夜追加分（×0.25）", "法定休日（×0.35）", "60時間超（×0.25）", "割増総額",
  "基礎賃金・時給・日給", "基本時給", "基本支給", "固定残業代", "交通費", "資格・役職手当（基礎賃金に含む）", "雑手当", "別バイト・MG代", "年末調整",
  "欠勤控除", "支給総額", "控除", "締め", "確認事項・備考",
];

export function toPayrollTable(rows: PayrollRow[], clinicName: Map<string, string>, month: string): ExportTable {
  return {
    title: `給与一覧（残業代計算表）_${month}`,
    headers: PAYROLL_HEADERS,
    rows: rows.map((r) => {
      const w = r.wage;
      const x = r.result;
      const amount = !w ? null : w.pay_type === "monthly" ? w.basic_wage : w.pay_type === "hourly" ? w.hourly_wage : w.daily_wage;
      return [
        clinicName.get(r.clinicId ?? "") ?? "",
        r.staff.staff_code,
        r.staffName,
        w ? PAY_TYPE_LABELS[w.pay_type] : "未登録",
        r.workDays,
        r.input.side_job_days || null,
        r.holidayDays,
        r.paidLeaveDays,
        r.paidBalance,
        r.specialDays,
        r.absentDays,
        x?.hours.total ?? null,
        x?.hours.lateNight ?? null,
        x?.hours.nonLegalHoliday ?? null,
        x?.hours.legalHoliday ?? null,
        x?.hours.paidLeave ?? null,
        x?.hours.fixedOvertime ?? null,
        x?.hours.excessOvertime ?? null,
        x?.hours.statutoryOvertime ?? null,
        x?.overtimePay ?? null,
        x?.lateNightPay ?? null,
        x?.legalHolidayPay ?? null,
        x?.over60Pay ?? null,
        x?.premiumTotal ?? null,
        amount === null ? null : Number(amount),
        x?.hourlyBase ?? null,
        x?.basePay ?? null,
        x?.fixedOvertimeAllowance ?? null,
        x?.commute ?? null,
        w ? Number(w.qualification_allowance) : null,
        x?.miscAllowance ?? null,
        x?.sideJobPay ?? null,
        x?.yearEndAdjustment ?? null,
        x?.absenceDeduction ?? null,
        x?.gross ?? null,
        x?.deduction ?? null,
        r.monthClosed ? "締め済み" : "未締め",
        [...(x?.warnings ?? []), ...(w ? [] : ["賃金が未登録です"]), r.input.note ?? ""].filter(Boolean).join("／"),
      ];
    }),
    numberFormats: [, , , , , , , , , , , , , , , , , , , "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "0.00", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0"],
  };
}
