import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import type { ClinicRow } from "@/lib/data/types";
import { loadPayrollMonth } from "@/lib/payroll/load";
import { PAY_TYPE_LABELS } from "@/lib/payroll/table";
import { addMonths, isValidMonth, todayJst } from "@/lib/time/jst";
import { savePayrollInput } from "../wages/actions";

const yen = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("ja-JP"));

/**
 * 給与一覧（本部のみ）：今の「残業代計算表」と同じ計算を、締め済みの勤怠から自動で行う。
 * 別バイト・MG代・年末調整・欠勤控除・控除などは月ごとに手入力する。
 */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string; clinic?: string }> }) {
  await requireHq();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const current = todayJst().slice(0, 7);
  const month = params.month && isValidMonth(params.month) ? params.month : addMonths(current, -1);

  const [{ data: clinicData }, rows] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name, display_order").order("display_order"),
    loadPayrollMonth(supabase, month),
  ]);
  const clinics = (clinicData ?? []) as (Pick<ClinicRow, "clinic_id" | "name"> & { display_order: number })[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const order = new Map(clinics.map((c) => [c.clinic_id, c.display_order]));
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? null;
  const shown = rows
    .filter((r) => !clinicId || r.clinicId === clinicId)
    .sort((a, b) => (order.get(a.clinicId ?? "") ?? 999) - (order.get(b.clinicId ?? "") ?? 999) || a.staff.staff_code.localeCompare(b.staff.staff_code));
  const notClosed = shown.filter((r) => !r.monthClosed).length;
  const total = shown.reduce((s, r) => s + (r.result?.gross ?? 0), 0);
  const premium = shown.reduce((s, r) => s + (r.result?.premiumTotal ?? 0), 0);
  const q = (p: Record<string, string>) => `?${new URLSearchParams({ month, ...(clinicId ? { clinic: clinicId } : {}), ...p })}`;
  const exportQuery = new URLSearchParams({ report: "payroll", month, ...(clinicId ? { clinic: clinicId } : {}) });

  return (
    <>
      <PageHeader
        title={`給与一覧（残業代計算表）：${month.replace("-", "年")}月`}
        description="締め済みの勤怠から、残業・深夜・法定休日・月60時間超の割増と支給総額を計算します。本部のみが閲覧できます。"
        actions={
          <span className="flex flex-wrap gap-2">
            <a href={`/exports/download?${exportQuery}&format=xlsx`} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">
              Excelで出力
            </a>
            <a href={`/exports/download?${exportQuery}&format=csv_sjis`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
              CSV（Shift_JIS）
            </a>
            <Link href="/hq/wages" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
              賃金マスタ
            </Link>
          </span>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link className="text-brand-700 underline" href={q({ month: addMonths(month, -1) })}>
          前月
        </Link>
        {month < current && (
          <Link className="text-brand-700 underline" href={q({ month: addMonths(month, 1) })}>
            翌月
          </Link>
        )}
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <select name="clinic" defaultValue={clinicId ?? ""} aria-label="院" className="rounded-md border border-slate-300 bg-white px-3 py-1.5">
            <option value="">全院</option>
            {clinics.map((c) => (
              <option key={c.clinic_id} value={c.clinic_id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">
            絞り込む
          </button>
        </form>
        <Badge tone="blue">支給総額 合計 {yen(total)}円</Badge>
        <Badge>うち割増 {yen(premium)}円</Badge>
        {notClosed > 0 && <Badge tone="yellow">未締めの院のスタッフ {notClosed}名（確定値ではありません）</Badge>}
      </div>

      <Card>
        {shown.length === 0 ? (
          <EmptyState>この月の対象スタッフはいません（賃金の登録または勤怠が必要です）</EmptyState>
        ) : (
          <Table
            head={["スタッフ", "形態", "出勤", "通常(h)", "深夜", "法定休日", "固定/超過", "残業", "深夜追加", "法定休日", "60h超", "基本支給", "固定残業代", "交通費", "雑手当", "別バイト等", "年末調整", "欠勤控除", "支給総額", "控除", "手入力"]}
          >
            {shown.map((r) => {
              const x = r.result;
              return (
                <tr key={r.staff.staff_id} className="align-top">
                  <Td>
                    <Link href={`/hq/wages/${r.staff.staff_id}`} className="font-medium text-brand-700 underline">
                      {r.staffName}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {r.staff.staff_code} {clinicName.get(r.clinicId ?? "") ?? ""}
                      {!r.monthClosed && <span className="ml-1 text-amber-700">未締め</span>}
                    </div>
                    {x?.warnings.map((w) => (
                      <div key={w} className="max-w-56 whitespace-normal text-xs text-amber-700">
                        {w}
                      </div>
                    ))}
                  </Td>
                  <Td>{r.wage ? PAY_TYPE_LABELS[r.wage.pay_type] : <Badge tone="yellow">賃金未登録</Badge>}</Td>
                  <Td>{r.workDays}日</Td>
                  <Td>{x?.hours.total ?? "—"}</Td>
                  <Td>{x?.hours.lateNight ?? "—"}</Td>
                  <Td>{x?.hours.legalHoliday ?? "—"}</Td>
                  <Td>{x ? `${x.hours.fixedOvertime} / ${x.hours.excessOvertime}` : "—"}</Td>
                  <Td>{yen(x?.overtimePay)}</Td>
                  <Td>{yen(x?.lateNightPay)}</Td>
                  <Td>{yen(x?.legalHolidayPay)}</Td>
                  <Td className={x?.over60Pay ? "font-bold text-rose-700" : ""}>{yen(x?.over60Pay)}</Td>
                  <Td>{yen(x?.basePay)}</Td>
                  <Td>{yen(x?.fixedOvertimeAllowance)}</Td>
                  <Td>{yen(x?.commute)}</Td>
                  <Td>{yen(x?.miscAllowance)}</Td>
                  <Td>{yen(x?.sideJobPay)}</Td>
                  <Td>{yen(x?.yearEndAdjustment)}</Td>
                  <Td>{yen(x?.absenceDeduction)}</Td>
                  <Td className="font-bold">{yen(x?.gross)}</Td>
                  <Td>{yen(x?.deduction)}</Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-sm text-brand-700">入力</summary>
                      <ActionForm action={savePayrollInput} submitLabel="保存" resetOnSuccess={false} className="mt-2 w-64 space-y-2">
                        <input type="hidden" name="staff_id" value={r.staff.staff_id} />
                        <input type="hidden" name="month" value={month} />
                        <Field label="別バイト・別MG業（日）">
                          <Input name="side_job_days" inputMode="decimal" defaultValue={r.input.side_job_days || ""} />
                        </Field>
                        <Field label="別バイト・MG代（円）">
                          <Input name="side_job_pay" inputMode="numeric" defaultValue={r.input.side_job_pay || ""} />
                        </Field>
                        <Field label="年末調整（円・徴収はマイナス）">
                          <Input name="year_end_adjustment" inputMode="numeric" defaultValue={r.input.year_end_adjustment || ""} />
                        </Field>
                        <Field label={`欠勤控除（円）${r.absentDays ? `：欠勤 ${r.absentDays}日` : ""}`}>
                          <Input name="absence_deduction" inputMode="numeric" defaultValue={r.input.absence_deduction || ""} />
                        </Field>
                        <Field label="雑手当（この月だけ・円）" hint="空欄は賃金マスタの額">
                          <Input name="misc_allowance" inputMode="numeric" defaultValue={r.input.misc_allowance ?? ""} />
                        </Field>
                        <Field label="控除（円）">
                          <Input name="deduction" inputMode="numeric" defaultValue={r.input.deduction || ""} />
                        </Field>
                        <Field label="備考">
                          <Input name="note" defaultValue={r.input.note ?? ""} />
                        </Field>
                      </ActionForm>
                    </details>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Card title="計算のしかた" className="mt-6">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>時間は月の合計を1時間単位にします（30分未満切り捨て・30分以上切り上げ）。「通常」は実労働の合計で、深夜・休日の時間も含みます。</li>
          <li>月給：基本時給＝基礎賃金÷月の所定時間（人ごと）。超過残業＝通常＋有休（時間換算）−残業の基準時間−固定残業時間。超過残業×基本時給×1.25。</li>
          <li>時給・日給：働いた時間は時給（日給）で支払い済みのため、超過残業は×0.25（割増分のみ）。</li>
          <li>深夜は×0.25、法定休日（休日管理の「法定内」の日）は×0.35を追加。法定時間外が月60時間を超えた分は×0.25を追加（法律で必要）。</li>
          <li>支給総額＝基本支給＋固定残業代＋雑手当＋割増＋交通費＋別バイト・MG代＋年末調整−欠勤控除。控除は支給総額とは別に表示します。</li>
          <li>給与計算は、勤怠が<b>締め済み</b>の月で行ってください（未締めの月は勤怠が変わる可能性があります）。</li>
        </ul>
      </Card>
    </>
  );
}
