import Link from "next/link";
import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isHq, managedClinicIds } from "@/lib/auth/permissions";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { ASSIGNMENT_TYPE_LABELS, isActiveOn, staffName, type AssignmentRow, type ClinicRow, type StaffRow } from "@/lib/data/types";
import { todayJst } from "@/lib/time/jst";

/**
 * 院ホーム。担当院（兼務なら複数）のスタッフを表示する。
 * 取得は院長本人の権限で行うため、RLS により他院スタッフは返らない。
 * フェーズ2以降でシフト・当日の出勤状況・承認待ちを追加する。
 */
export default async function ManagerHomePage() {
  const actor = await requireManager();
  const supabase = await createSupabaseServer();
  const today = todayJst();
  const clinicIds = isHq(actor) && managedClinicIds(actor).length === 0 ? null : managedClinicIds(actor);

  const clinicQuery = supabase.from("clinics").select("*").order("display_order");
  const [{ data: clinicData }, { data: assignmentData }, { data: staffData }] = await Promise.all([
    clinicIds ? clinicQuery.in("clinic_id", clinicIds) : clinicQuery,
    supabase.from("staff_clinic_assignments").select("*"),
    supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name, status").neq("status", "retired"),
  ]);
  const clinics = (clinicData ?? []) as ClinicRow[];
  const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => isActiveOn(a, today));
  const staffById = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_id, s]));

  return (
    <>
      <PageHeader
        title="院ホーム"
        description={isHq(actor) && !clinicIds ? "本部権限のため全院を表示しています" : "担当院のスタッフ一覧です"}
      />
      <div className="space-y-6">
        {clinics.map((clinic) => {
          const members = assignments
            .filter((a) => a.clinic_id === clinic.clinic_id && staffById.has(a.staff_id))
            .sort((a, b) => (a.assignment_type === b.assignment_type ? 0 : a.assignment_type === "primary" ? -1 : 1));
          return (
            <Card key={clinic.clinic_id} title={clinic.name}>
              <Link href={`/clinics/${clinic.clinic_id}`} className="mb-3 inline-block text-sm text-brand-700 underline">
                診療時間・休診日の調整
              </Link>
              {members.length === 0 ? (
                <EmptyState>所属スタッフはいません</EmptyState>
              ) : (
                <Table head={["スタッフID", "氏名", "区分", "期間"]}>
                  {members.map((a) => {
                    const s = staffById.get(a.staff_id) as StaffRow;
                    return (
                      <tr key={a.assignment_id}>
                        <Td className="font-mono">{s.staff_code}</Td>
                        <Td>{staffName(s)}</Td>
                        <Td>
                          <Badge tone={a.assignment_type === "primary" ? "blue" : "yellow"}>
                            {ASSIGNMENT_TYPE_LABELS[a.assignment_type]}
                          </Badge>
                        </Td>
                        <Td className="text-slate-600">
                          {a.valid_from} 〜 {a.valid_to ?? ""}
                        </Td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
