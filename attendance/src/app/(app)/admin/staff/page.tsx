import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Select, Table, Td } from "@/components/ui";
import {
  STAFF_STATUS_LABELS,
  isActiveOn,
  staffName,
  type AssignmentRow,
  type ClinicRow,
  type StaffRow,
} from "@/lib/data/types";
import { todayJst } from "@/lib/time/jst";

export default async function StaffListPage({ searchParams }: { searchParams: Promise<{ clinic?: string; status?: string }> }) {
  await requireHq();
  const { clinic: clinicFilter, status: statusFilter = "active" } = await searchParams;
  const supabase = await createSupabaseServer();
  const today = todayJst();

  const [{ data: clinicData }, { data: staffData }, { data: assignmentData }] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name, status, display_order").order("display_order"),
    supabase.from("staff_profiles").select("*").order("staff_code"),
    supabase.from("staff_clinic_assignments").select("*"),
  ]);
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name" | "status">[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const assignments = (assignmentData ?? []) as AssignmentRow[];

  const rows = ((staffData ?? []) as StaffRow[])
    .map((s) => {
      const current = assignments.filter((a) => a.staff_id === s.staff_id && isActiveOn(a, today));
      return {
        staff: s,
        primary: current.find((a) => a.assignment_type === "primary"),
        supports: current.filter((a) => a.assignment_type === "support"),
      };
    })
    .filter((r) => statusFilter === "all" || r.staff.status === statusFilter)
    .filter(
      (r) => !clinicFilter || r.primary?.clinic_id === clinicFilter || r.supports.some((a) => a.clinic_id === clinicFilter),
    );

  return (
    <>
      <PageHeader
        title="スタッフ"
        description="スタッフIDは共用端末での本人確認（ID＋PIN）に使います。"
        actions={
          <Link href="/admin/staff/new" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            ＋ スタッフ登録
          </Link>
        }
      />
      <Card>
        <form className="mb-4 flex flex-wrap gap-3" method="get">
          <Select name="clinic" defaultValue={clinicFilter ?? ""} aria-label="院で絞り込み" className="w-48">
            <option value="">全院</option>
            {clinics.map((c) => (
              <option key={c.clinic_id} value={c.clinic_id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={statusFilter} aria-label="在籍状態" className="w-32">
            <option value="active">在籍</option>
            <option value="on_leave">休職</option>
            <option value="retired">退職</option>
            <option value="all">すべて</option>
          </Select>
          <button type="submit" className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            絞り込み
          </button>
        </form>

        {rows.length === 0 ? (
          <EmptyState>該当するスタッフはいません</EmptyState>
        ) : (
          <Table head={["スタッフID", "氏名", "主所属院", "応援先", "入社日", "状態", ""]}>
            {rows.map(({ staff, primary, supports }) => (
              <tr key={staff.staff_id}>
                <Td className="font-mono">{staff.staff_code}</Td>
                <Td className="font-medium">{staffName(staff)}</Td>
                <Td>{primary ? clinicName.get(primary.clinic_id) : <Badge tone="red">未設定</Badge>}</Td>
                <Td>{supports.map((a) => clinicName.get(a.clinic_id)).join("、") || "—"}</Td>
                <Td>{staff.hire_date}</Td>
                <Td>
                  <Badge tone={staff.status === "active" ? "green" : "gray"}>{STAFF_STATUS_LABELS[staff.status]}</Badge>
                </Td>
                <Td>
                  <Link href={`/admin/staff/${staff.staff_id}`} className="text-brand-700 underline">
                    詳細
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
