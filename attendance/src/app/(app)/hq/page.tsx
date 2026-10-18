import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { CLINIC_STATUS_LABELS, isActiveOn, type AssignmentRow, type ClinicRow } from "@/lib/data/types";
import { todayJst } from "@/lib/time/jst";

/** 本部ホーム。フェーズ5で統合ダッシュボード（出勤状況・承認待ち・残数など）に拡張する */
export default async function HqHomePage() {
  await requireHq();
  const supabase = await createSupabaseServer();
  const today = todayJst();

  const [{ data: clinicData }, { data: assignmentData }, { data: staffData }] = await Promise.all([
    supabase.from("clinics").select("*").order("display_order"),
    supabase.from("staff_clinic_assignments").select("staff_id, clinic_id, assignment_type, valid_from, valid_to"),
    supabase.from("staff_profiles").select("staff_id").eq("status", "active"),
  ]);
  const clinics = (clinicData ?? []) as ClinicRow[];
  const activeStaff = new Set(((staffData ?? []) as { staff_id: string }[]).map((s) => s.staff_id));
  const current = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => activeStaff.has(a.staff_id) && isActiveOn(a, today));

  return (
    <>
      <PageHeader title="本部ホーム" description={`${today} 時点`} />
      <Card title="院別スタッフ数">
        <Table head={["院", "状態", "主所属スタッフ", "応援登録"]}>
          {clinics.map((c) => (
            <tr key={c.clinic_id}>
              <Td className="font-medium">{c.name}</Td>
              <Td>
                <Badge tone={c.status === "active" ? "green" : "gray"}>{CLINIC_STATUS_LABELS[c.status]}</Badge>
              </Td>
              <Td>
                <Link href={`/admin/staff?clinic=${c.clinic_id}`} className="text-brand-700 underline">
                  {current.filter((a) => a.clinic_id === c.clinic_id && a.assignment_type === "primary").length} 名
                </Link>
              </Td>
              <Td>{current.filter((a) => a.clinic_id === c.clinic_id && a.assignment_type === "support").length} 名</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
