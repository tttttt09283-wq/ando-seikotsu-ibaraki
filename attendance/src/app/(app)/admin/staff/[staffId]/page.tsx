import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import {
  ASSIGNMENT_TYPE_LABELS,
  isActiveOn,
  staffName,
  type AccountRow,
  type AssignmentRow,
  type ClinicRow,
  type ContractRow,
  type StaffPrivateRow,
  type StaffRow,
} from "@/lib/data/types";
import { todayJst } from "@/lib/time/jst";
import { addSupportAssignment, endAssignment, transferStaff, updateStaff } from "../actions";
import { StaffNameFields, StaffPrivateFields } from "../StaffFields";
import { ContractCard } from "./ContractCard";

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireHq();
  const { staffId } = await params;
  const { created } = await searchParams;
  if (!z.uuid().safeParse(staffId).success) notFound();

  const supabase = await createSupabaseServer();
  const [{ data: staff }, { data: details }, { data: assignmentData }, { data: clinicData }, { data: contractData }] = await Promise.all([
    supabase.from("staff_profiles").select("*").eq("staff_id", staffId).maybeSingle(),
    supabase.from("staff_private_details").select("*").eq("staff_id", staffId).maybeSingle(),
    supabase.from("staff_clinic_assignments").select("*").eq("staff_id", staffId).order("valid_from", { ascending: false }),
    supabase.from("clinics").select("clinic_id, name, status").order("display_order"),
    supabase.from("employment_contracts").select("*").eq("staff_id", staffId).order("valid_from", { ascending: false }),
  ]);
  if (!staff) notFound();
  const s = staff as StaffRow;

  const { data: account } = s.auth_user_id
    ? await supabase.from("app_accounts").select("email, display_name").eq("user_id", s.auth_user_id).maybeSingle()
    : { data: null };

  const today = todayJst();
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name" | "status">[];
  const activeClinics = clinics.filter((c) => c.status === "active");
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const assignments = (assignmentData ?? []) as AssignmentRow[];
  const currentPrimary = assignments.find((a) => a.assignment_type === "primary" && isActiveOn(a, today));

  return (
    <>
      <PageHeader
        title={`${staffName(s)}（${s.staff_code}）`}
        description={`主所属：${currentPrimary ? clinicName.get(currentPrimary.clinic_id) : "未設定"}`}
        actions={
          <Link href="/admin/staff" className="text-sm text-brand-700 underline">
            一覧へ戻る
          </Link>
        }
      />
      {created && <p className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">スタッフを登録しました。</p>}

      <div className="space-y-6">
        <Card title="基本情報・個人情報">
          <ActionForm action={updateStaff} submitLabel="保存" resetOnSuccess={false}>
            <input type="hidden" name="staff_id" value={s.staff_id} />
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="スタッフID" hint="変更不可">
                <Input value={s.staff_code} disabled readOnly />
              </Field>
              <Field label="入社日">
                <Input name="hire_date" type="date" defaultValue={s.hire_date} required />
              </Field>
              <Field label="退職日">
                <Input name="retire_date" type="date" defaultValue={s.retire_date ?? ""} />
              </Field>
              <Field label="在籍状態">
                <Select name="status" defaultValue={s.status}>
                  <option value="active">在籍</option>
                  <option value="on_leave">休職</option>
                  <option value="retired">退職</option>
                </Select>
              </Field>
            </div>
            <StaffNameFields staff={s} />
            <StaffPrivateFields details={details as StaffPrivateRow | null} />
          </ActionForm>
        </Card>

        <ContractCard staffId={s.staff_id} contracts={(contractData ?? []) as ContractRow[]} today={today} />

        <Card title="所属・応援勤務の履歴">
          {assignments.length === 0 ? (
            <EmptyState>所属が登録されていません</EmptyState>
          ) : (
            <Table head={["種別", "院", "開始日", "終了日", "備考", "状態", ""]}>
              {assignments.map((a) => (
                <tr key={a.assignment_id}>
                  <Td>
                    <Badge tone={a.assignment_type === "primary" ? "blue" : "yellow"}>{ASSIGNMENT_TYPE_LABELS[a.assignment_type]}</Badge>
                  </Td>
                  <Td>{clinicName.get(a.clinic_id)}</Td>
                  <Td>{a.valid_from}</Td>
                  <Td>{a.valid_to ?? "—"}</Td>
                  <Td className="text-slate-600">{a.note ?? ""}</Td>
                  <Td>
                    {isActiveOn(a, today) ? (
                      <Badge tone="green">有効</Badge>
                    ) : a.valid_from > today ? (
                      <Badge tone="blue">予定</Badge>
                    ) : (
                      <Badge>終了</Badge>
                    )}
                  </Td>
                  <Td>
                    {a.assignment_type === "support" && (a.valid_to === null || a.valid_to >= today) && (
                      <ActionForm action={endAssignment} submitLabel="終了日を設定" tone="secondary" className="flex gap-2">
                        <input type="hidden" name="assignment_id" value={a.assignment_id} />
                        <Input name="valid_to" type="date" defaultValue={today} aria-label="応援終了日" className="w-36" required />
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="所属院の異動">
            <p className="mb-4 text-sm text-slate-600">
              異動日の前日で現在の主所属を終了し、異動日から新しい院を主所属にします。過去の勤怠は当時の院のまま残ります。
            </p>
            <ActionForm
              action={transferStaff}
              submitLabel="異動を登録"
              confirmMessage="異動を登録します。よろしいですか？"
            >
              <input type="hidden" name="staff_id" value={s.staff_id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="異動先">
                  <Select name="new_clinic_id" required defaultValue="">
                    <option value="" disabled>
                      選択してください
                    </option>
                    {activeClinics
                      .filter((c) => c.clinic_id !== currentPrimary?.clinic_id)
                      .map((c) => (
                        <option key={c.clinic_id} value={c.clinic_id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="異動日">
                  <Input name="effective_date" type="date" required />
                </Field>
              </div>
              <Field label="備考">
                <Input name="note" />
              </Field>
            </ActionForm>
          </Card>

          <Card title="応援勤務先の登録">
            <p className="mb-4 text-sm text-slate-600">
              応援先の院長がシフトを組めるようになります。応援先の院長が閲覧できるのは氏名・スタッフIDのみです。
            </p>
            <ActionForm action={addSupportAssignment} submitLabel="応援先を追加">
              <input type="hidden" name="staff_id" value={s.staff_id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="応援先">
                  <Select name="clinic_id" required defaultValue="">
                    <option value="" disabled>
                      選択してください
                    </option>
                    {activeClinics
                      .filter((c) => c.clinic_id !== currentPrimary?.clinic_id)
                      .map((c) => (
                        <option key={c.clinic_id} value={c.clinic_id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="開始日">
                  <Input name="valid_from" type="date" defaultValue={today} required />
                </Field>
                <Field label="終了日" hint="未定なら空欄">
                  <Input name="valid_to" type="date" />
                </Field>
              </div>
              <Field label="備考">
                <Input name="note" />
              </Field>
            </ActionForm>
          </Card>
        </div>

        <Card title="管理画面アカウント">
          <p className="text-sm text-slate-700">
            {account
              ? `紐付け済み：${(account as Pick<AccountRow, "email" | "display_name">).email}`
              : "管理画面アカウントは紐付いていません（一般スタッフは共用端末のみで利用できます）。"}
          </p>
          <Link href="/admin/users" className="mt-2 inline-block text-sm text-brand-700 underline">
            アカウント・権限の管理へ
          </Link>
        </Card>
      </div>
    </>
  );
}
