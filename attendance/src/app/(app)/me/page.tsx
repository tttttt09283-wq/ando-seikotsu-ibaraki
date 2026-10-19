import { requireActor } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { staffName, type ClinicRow, type StaffRow } from "@/lib/data/types";
import { SHIFT_STATUS_LABELS, shiftLabel, toShiftView, type ShiftRow } from "@/lib/shifts/model";
import { addMonths, monthDates, todayJst, weekdayOf, WEEKDAY_LABELS } from "@/lib/time/jst";

/** マイページ：自分の確定シフト（今月・来月）。下書きは院長が確定するまで表示されない */
export default async function MyPage() {
  const actor = await requireActor();
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("staff_profiles")
    .select("staff_id, staff_code, family_name, given_name")
    .eq("auth_user_id", actor.userId)
    .maybeSingle();
  const staff = data as Pick<StaffRow, "staff_id" | "staff_code" | "family_name" | "given_name"> | null;

  const today = todayJst();
  const from = `${today.slice(0, 7)}-01`;
  const to = monthDates(addMonths(today.slice(0, 7), 1)).at(-1) as string;
  const [{ data: shiftData }, { data: clinicData }] = staff
    ? await Promise.all([
        supabase
          .from("shifts")
          .select("*")
          .eq("staff_id", staff.staff_id)
          .gte("work_date", from)
          .lte("work_date", to)
          .in("status", ["confirmed", "revised"])
          .order("work_date")
          .order("scheduled_start", { nullsFirst: true }),
        supabase.from("clinics").select("clinic_id, name"),
      ])
    : [{ data: [] }, { data: [] }];
  const shifts = ((shiftData ?? []) as ShiftRow[]).map(toShiftView);
  const { data: balanceData } = staff ? await supabase.rpc("leave_balances", { p_staff_id: staff.staff_id }) : { data: [] };
  const balances = Object.fromEntries(
    ((balanceData ?? []) as { leave_type: string; balance: string; reserved: string }[]).map((b) => [b.leave_type, b]),
  );
  const clinicName = new Map(((clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name">[]).map((c) => [c.clinic_id, c.name]));

  return (
    <>
      <PageHeader title="マイページ" />
      <div className="space-y-6">
        <Card>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">表示名</dt>
            <dd>{actor.displayName}</dd>
            <dt className="text-slate-500">ログインID</dt>
            <dd>{actor.email}</dd>
            <dt className="text-slate-500">ロール</dt>
            <dd>{[...new Set(actor.roles.map((r) => ROLE_LABELS[r.role]))].join("・") || "なし"}</dd>
            <dt className="text-slate-500">スタッフ</dt>
            <dd>{staff ? `${staffName(staff)}（${staff.staff_code}）` : "紐付けなし"}</dd>
          </dl>
        </Card>

        {staff && (
          <Card title="休暇の残数">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">有給休暇</dt>
              <dd>
                {Number(balances.paid?.balance ?? 0)}日
                {Number(balances.paid?.reserved ?? 0) > 0 && <span className="ml-2 text-slate-500">（申請中 {Number(balances.paid?.reserved)}日）</span>}
              </dd>
              <dt className="text-slate-500">振休</dt>
              <dd>
                {Number(balances.holiday_credit?.balance ?? 0)}日
                {Number(balances.holiday_credit?.reserved ?? 0) > 0 && (
                  <span className="ml-2 text-slate-500">（申請中 {Number(balances.holiday_credit?.reserved)}日）</span>
                )}
              </dd>
            </dl>
            <p className="mt-2 text-xs text-slate-500">休暇の申請は各院の共用端末の「休暇申請」から行えます。</p>
          </Card>
        )}

        {staff && (
          <Card title="自分のシフト（確定分・今月と来月）">
            {shifts.length === 0 ? (
              <EmptyState>確定したシフトはまだありません</EmptyState>
            ) : (
              <Table head={["日付", "院", "シフト", "休憩", "状態"]}>
                {shifts.map((s) => (
                  <tr key={s.shiftId} className={s.workDate < today ? "text-slate-400" : ""}>
                    <Td>
                      {s.workDate.slice(5).replace("-", "/")}（{WEEKDAY_LABELS[weekdayOf(s.workDate)]}）
                    </Td>
                    <Td>{clinicName.get(s.clinicId)}</Td>
                    <Td>{shiftLabel(s)}</Td>
                    <Td>{s.type === "work" ? `${s.breakMinutes}分` : ""}</Td>
                    <Td>{s.status === "revised" ? <Badge tone="yellow">{SHIFT_STATUS_LABELS.revised}</Badge> : ""}</Td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="mt-2 text-xs text-slate-500">シフトの変更は院長にご相談ください（スタッフは変更できません）。</p>
          </Card>
        )}
      </div>
    </>
  );
}
