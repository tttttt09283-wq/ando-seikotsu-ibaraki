import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { isActiveOn, staffName, type AssignmentRow, type ClinicRow, type StaffRow } from "@/lib/data/types";
import { wageForMonth } from "@/lib/payroll/calc";
import type { WageRow } from "@/lib/payroll/load";
import { PAY_TYPE_LABELS } from "@/lib/payroll/table";
import { todayJst } from "@/lib/time/jst";

const yen = (v: number | string | null) => (v === null ? "—" : `${Number(v).toLocaleString("ja-JP")}円`);

/** 賃金マスタ（本部のみ）：スタッフごとの現在の賃金 */
export default async function WagesPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  await requireHq();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const today = todayJst();
  const [{ data: clinicData }, { data: staffData }, { data: assignmentData }, { data: wageData }] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name").order("display_order"),
    supabase.from("staff_profiles").select("*").neq("status", "retired").order("staff_code"),
    supabase.from("staff_clinic_assignments").select("*").eq("assignment_type", "primary"),
    supabase.from("staff_wage_settings").select("*"),
  ]);
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name">[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => isActiveOn(a, today));
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? null;
  const wages = (wageData ?? []) as WageRow[];
  const staff = ((staffData ?? []) as StaffRow[])
    .map((s) => ({ s, clinic: assignments.find((a) => a.staff_id === s.staff_id)?.clinic_id ?? null }))
    .filter((x) => !clinicId || x.clinic === clinicId);
  const missing = staff.filter((x) => !wageForMonth(wages, x.s.staff_id, today.slice(0, 7))).length;

  return (
    <>
      <PageHeader
        title="賃金マスタ"
        description="スタッフごとの賃金（月給・時給・日給、手当、固定残業代、交通費、月の所定時間）。本部のみが閲覧・変更できます。"
        actions={
          <span className="flex gap-3">
            <Link href="/hq/wages/import" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
              賃金管理表（Excel）から取り込む
            </Link>
            <Link href="/hq/payroll" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">
              給与一覧へ
            </Link>
          </span>
        }
      />
      <form method="get" className="mb-4 flex items-center gap-2 text-sm">
        <select name="clinic" defaultValue={clinicId ?? ""} aria-label="院" className="rounded-md border border-slate-300 bg-white px-3 py-2">
          <option value="">全院</option>
          {clinics.map((c) => (
            <option key={c.clinic_id} value={c.clinic_id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
          絞り込む
        </button>
        {missing > 0 && <Badge tone="yellow">賃金が未登録 {missing}名</Badge>}
      </form>
      <Card>
        {staff.length === 0 ? (
          <EmptyState>スタッフがいません</EmptyState>
        ) : (
          <Table head={["院", "スタッフ", "給与形態", "基礎賃金・時給・日給", "月の所定時間", "残業の基準", "固定残業代", "交通費", "雑手当", "適用開始", ""]}>
            {staff.map(({ s, clinic }) => {
              const w = wageForMonth(wages, s.staff_id, today.slice(0, 7));
              return (
                <tr key={s.staff_id}>
                  <Td>{clinic ? clinicName.get(clinic) : "—"}</Td>
                  <Td>
                    <div className="font-medium">{staffName(s)}</div>
                    <div className="text-xs text-slate-500">{s.staff_code}</div>
                  </Td>
                  {w ? (
                    <>
                      <Td>{PAY_TYPE_LABELS[w.pay_type]}</Td>
                      <Td>{yen(w.pay_type === "monthly" ? w.basic_wage : w.pay_type === "hourly" ? w.hourly_wage : w.daily_wage)}</Td>
                      <Td>{w.monthly_hours === null ? "—" : `${Number(w.monthly_hours)}時間`}</Td>
                      <Td>{w.overtime_threshold_hours === null ? "—" : `${Number(w.overtime_threshold_hours)}時間`}</Td>
                      <Td>{yen(w.fixed_overtime_allowance)}</Td>
                      <Td>{w.commute_type === "none" ? "—" : w.commute_type === "monthly" ? `月 ${yen(w.commute_amount)}` : `日 ${yen(w.commute_amount)}`}</Td>
                      <Td>{Number(w.misc_allowance) ? yen(w.misc_allowance) : "—"}</Td>
                      <Td>{w.valid_from.slice(0, 7)}</Td>
                    </>
                  ) : (
                    <td colSpan={8} className="px-3 py-2">
                      <Badge tone="yellow">未登録</Badge>
                    </td>
                  )}
                  <Td>
                    <Link href={`/hq/wages/${s.staff_id}`} className="text-brand-700 underline">
                      {w ? "変更・履歴" : "登録"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
