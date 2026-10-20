import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { isActiveOn, minutesToHours, staffName, type ContractRow, type StaffRow } from "@/lib/data/types";
import type { WageRow } from "@/lib/payroll/load";
import { PAY_TYPE_LABELS } from "@/lib/payroll/table";
import { todayJst } from "@/lib/time/jst";
import { WageForm } from "../WageForm";

const yen = (v: number | string | null) => (v === null ? "—" : `${Number(v).toLocaleString("ja-JP")}円`);

/** スタッフ別の賃金（本部のみ）：登録・変更と履歴 */
export default async function StaffWagePage({ params }: { params: Promise<{ staffId: string }> }) {
  await requireHq();
  const { staffId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) notFound();
  const supabase = await createSupabaseServer();
  const today = todayJst();
  const [{ data: staffData }, { data: wageData }, { data: contractData }] = await Promise.all([
    supabase.from("staff_profiles").select("*").eq("staff_id", staffId).maybeSingle(),
    supabase.from("staff_wage_settings").select("*").eq("staff_id", staffId).order("valid_from", { ascending: false }),
    supabase.from("employment_contracts").select("*").eq("staff_id", staffId),
  ]);
  const staff = staffData as StaffRow | null;
  if (!staff) notFound();
  const history = (wageData ?? []) as WageRow[];
  const contract = ((contractData ?? []) as ContractRow[]).find((c) => isActiveOn(c, today));

  return (
    <>
      <PageHeader
        title={`賃金：${staffName(staff)}`}
        description={`スタッフID ${staff.staff_code}・入社 ${staff.hire_date}`}
        actions={
          <Link href="/hq/wages" className="text-sm text-brand-700 underline">
            賃金マスタへ戻る
          </Link>
        }
      />
      <div className="space-y-6">
        <Card title="勤務条件（残業代の計算に使う値）">
          {contract ? (
            <p className="text-sm text-slate-700">
              1日の所定 {minutesToHours(contract.daily_scheduled_minutes)}・みなし残業（固定残業時間） {minutesToHours(contract.fixed_overtime_minutes)}。
              変更は
              <Link href={`/admin/staff/${staff.staff_id}`} className="mx-1 text-brand-700 underline">
                スタッフ詳細
              </Link>
              の勤務条件から。
            </p>
          ) : (
            <p className="text-sm text-amber-700">勤務条件が未登録です（固定残業時間0・1日8時間として計算します）。</p>
          )}
        </Card>
        <Card title="賃金の登録・変更">
          <WageForm staffId={staff.staff_id} current={history[0] ?? null} defaultMonth={today.slice(0, 7)} />
        </Card>
        <Card title="履歴">
          {history.length === 0 ? (
            <EmptyState>まだ登録されていません</EmptyState>
          ) : (
            <Table head={["適用開始", "給与形態", "基礎賃金・時給・日給", "月の所定時間", "残業の基準", "固定残業代", "交通費", "雑手当", "備考"]}>
              {history.map((w) => (
                <tr key={w.id}>
                  <Td>{w.valid_from.slice(0, 7)}</Td>
                  <Td>{PAY_TYPE_LABELS[w.pay_type]}</Td>
                  <Td>{yen(w.pay_type === "monthly" ? w.basic_wage : w.pay_type === "hourly" ? w.hourly_wage : w.daily_wage)}</Td>
                  <Td>{w.monthly_hours === null ? "—" : `${Number(w.monthly_hours)}時間`}</Td>
                  <Td>{w.overtime_threshold_hours === null ? "—" : `${Number(w.overtime_threshold_hours)}時間`}</Td>
                  <Td>{yen(w.fixed_overtime_allowance)}</Td>
                  <Td>{w.commute_type === "none" ? "—" : `${w.commute_type === "monthly" ? "月" : "日"} ${yen(w.commute_amount)}`}</Td>
                  <Td>{Number(w.misc_allowance) ? yen(w.misc_allowance) : "—"}</Td>
                  <Td className="whitespace-normal">{w.note ?? ""}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
