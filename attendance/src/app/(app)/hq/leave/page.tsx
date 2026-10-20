import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, PageHeader, Select, Table, Td } from "@/components/ui";
import { isActiveOn, staffName, type AssignmentRow, type ClinicRow, type ContractRow, type StaffRow } from "@/lib/data/types";
import { basisFromSettings, nextPlannedGrant } from "@/lib/leave/schedule";
import { todayJst } from "@/lib/time/jst";
import { expirePaidLeave, grantPaidLeave } from "./actions";

interface GrantRow {
  leave_grant_id: string;
  staff_id: string;
  grant_date: string;
  granted_days: string;
  used_days: string;
  expired_days: string;
  adjusted_days: string;
  expiration_date: string;
}

interface Obligation {
  staff_id: string;
  grant_date: string;
  period_end: string;
  taken_days: string;
  shortfall: string;
}

const TYPE_LABEL = { statutory: "法定", proportional: "比例" } as const;

/**
 * 有給台帳（本部）：全院のスタッフの残数、付与予定、年5日取得義務、期限切れの失効処理。
 * 付与予定は入社日（基準日方式のスタッフは基準日）と勤務条件から計算する。出勤率8割の確認は本部が行ってから「付与」する。
 */
export default async function PaidLeaveLedgerPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  await requireHq();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const today = todayJst();

  const [{ data: staffData }, { data: assignmentData }, { data: clinicData }, { data: grantData }, { data: contractData }, { data: obligationData }, { data: pendingData }, { data: settingData }] =
    await Promise.all([
      supabase.from("staff_profiles").select("*").neq("status", "retired").order("staff_code"),
      supabase.from("staff_clinic_assignments").select("*").eq("assignment_type", "primary"),
      supabase.from("clinics").select("clinic_id, name").order("display_order"),
      supabase.from("leave_grants").select("*"),
      supabase.from("employment_contracts").select("*"),
      supabase.rpc("annual_leave_obligations", { p_as_of: today }),
      supabase.from("leave_requests").select("staff_id, days_requested").eq("leave_type", "paid").in("status", ["pending", "manager_approved"]),
      supabase.from("staff_leave_settings").select("staff_id, grant_basis, first_base_date"),
    ]);
  const settings = (settingData ?? []) as { staff_id: string; grant_basis: string; first_base_date: string | null }[];
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name">[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const assignments = (assignmentData ?? []) as AssignmentRow[];
  const grants = (grantData ?? []) as GrantRow[];
  const contracts = (contractData ?? []) as ContractRow[];
  const obligations = (obligationData ?? []) as Obligation[];
  const pending = (pendingData ?? []) as { staff_id: string; days_requested: string }[];

  const rows = ((staffData ?? []) as StaffRow[])
    .map((s) => {
      const primary = assignments.find((a) => a.staff_id === s.staff_id && isActiveOn(a, today));
      const mine = grants.filter((g) => g.staff_id === s.staff_id);
      const remaining = mine
        .filter((g) => g.grant_date <= today && g.expiration_date >= today)
        .reduce((sum, g) => sum + Number(g.granted_days) + Number(g.adjusted_days) - Number(g.used_days) - Number(g.expired_days), 0);
      const contract = contracts.find((c) => c.staff_id === s.staff_id && isActiveOn(c, today));
      const plan = nextPlannedGrant(
        s.hire_date,
        { weeklyDays: Number(contract?.weekly_scheduled_days ?? 5), weeklyMinutes: contract?.weekly_scheduled_minutes ?? 2400 },
        mine.map((g) => g.grant_date),
        today,
        30,
        basisFromSettings(settings.find((x) => x.staff_id === s.staff_id)),
      );
      return {
        staff: s,
        clinicId: primary?.clinic_id ?? null,
        remaining,
        reserved: pending.filter((p) => p.staff_id === s.staff_id).reduce((sum, p) => sum + Number(p.days_requested), 0),
        plan,
        hasContract: Boolean(contract),
        obligation: obligations.find((o) => o.staff_id === s.staff_id),
        expired: mine.some((g) => g.expiration_date < today && Number(g.granted_days) + Number(g.adjusted_days) - Number(g.used_days) - Number(g.expired_days) > 0),
      };
    })
    .filter((r) => !params.clinic || r.clinicId === params.clinic);
  const hasExpired = rows.some((r) => r.expired);

  return (
    <>
      <PageHeader
        title="有給台帳"
        description="残数は付与・使用・失効・調整の台帳から計算しています。付与予定は入社日（基準日方式のスタッフは基準日）と勤務条件（週の日数・時間）から計算し、出勤率8割の確認後に付与してください。"
        actions={
          <div className="flex gap-4">
            <Link href="/hq/leave/import" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Excelから取込
            </Link>
            <Link href="/admin/leave-policies" className="self-center text-sm text-brand-700 underline">
              休暇の設定
            </Link>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <form method="get" className="flex items-center gap-2">
          <Select name="clinic" defaultValue={params.clinic ?? ""} aria-label="院" className="w-44">
            <option value="">全院</option>
            {clinics.map((c) => (
              <option key={c.clinic_id} value={c.clinic_id}>
                {c.name}
              </option>
            ))}
          </Select>
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            絞り込み
          </button>
        </form>
        {hasExpired && (
          <ActionForm
            action={expirePaidLeave}
            submitLabel="期限切れの有給を失効処理"
            tone="danger"
            className="flex items-center gap-3"
            confirmMessage="有効期限（付与から2年）を過ぎた残数を失効として記録します。よろしいですか？"
          />
        )}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState>対象のスタッフがいません</EmptyState>
        ) : (
          <Table head={["スタッフ", "主所属", "入社日", "残数", "申請中", "年5日取得義務", "次回付与予定", ""]}>
            {rows.map((r) => (
              <tr key={r.staff.staff_id} className="align-top">
                <Td>
                  <Link href={`/hq/leave/${r.staff.staff_id}`} className="font-medium text-brand-700 underline">
                    {staffName(r.staff)}
                  </Link>
                  <div className="text-xs text-slate-500">{r.staff.staff_code}</div>
                </Td>
                <Td>{r.clinicId ? clinicName.get(r.clinicId) : "—"}</Td>
                <Td>{r.staff.hire_date}</Td>
                <Td className="font-bold">{r.remaining}日</Td>
                <Td>{r.reserved ? `${r.reserved}日` : "—"}</Td>
                <Td>
                  {r.obligation ? (
                    <>
                      取得 {Number(r.obligation.taken_days)}日 / 5日
                      {Number(r.obligation.shortfall) > 0 && (
                        <div>
                          <Badge tone="yellow">あと{Number(r.obligation.shortfall)}日（{r.obligation.period_end}まで）</Badge>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">対象外</span>
                  )}
                </Td>
                <Td>
                  {r.plan ? (
                    <>
                      {r.plan.grantDate}・{r.plan.days}日（{TYPE_LABEL[r.plan.type]}）
                      {r.plan.grantDate < today && (
                        <div>
                          <Badge tone="red">付与日を過ぎています</Badge>
                        </div>
                      )}
                      {!r.hasContract && <div className="text-xs text-amber-700">勤務条件未登録（週5日として計算）</div>}
                    </>
                  ) : (
                    <span className="text-slate-400">30日以内の予定なし</span>
                  )}
                </Td>
                <Td>
                  {r.plan && (
                    <ActionForm action={grantPaidLeave} submitLabel={`${r.plan.days}日を付与`} className="flex gap-2" confirmMessage="出勤率8割以上を確認のうえ付与します。よろしいですか？">
                      <input type="hidden" name="staff_id" value={r.staff.staff_id} />
                      <input type="hidden" name="grant_date" value={r.plan.grantDate} />
                      <input type="hidden" name="days" value={r.plan.days} />
                      <input type="hidden" name="grant_type" value={r.plan.type} />
                    </ActionForm>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        既存の残数の移行・手動付与・調整は、スタッフ名から個別の台帳を開いて行います。年5日取得義務は10日以上付与された日から1年間の取得日数です。
      </p>
    </>
  );
}
