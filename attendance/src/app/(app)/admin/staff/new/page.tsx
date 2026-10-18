import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import type { ClinicRow } from "@/lib/data/types";
import { todayJst } from "@/lib/time/jst";
import { createStaff } from "../actions";
import { StaffNameFields, StaffPrivateFields } from "../StaffFields";

export default async function NewStaffPage() {
  await requireHq();
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("clinics").select("clinic_id, name").eq("status", "active").order("display_order");
  const clinics = (data ?? []) as Pick<ClinicRow, "clinic_id" | "name">[];

  return (
    <>
      <PageHeader title="スタッフ登録" description="雇用契約・勤務条件と共用端末用PINは、勤怠機能（フェーズ3）で登録します。" />
      <Card>
        <ActionForm action={createStaff} submitLabel="登録" resetOnSuccess={false}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="スタッフID" hint="4〜8桁の数字。共用端末での本人確認に使用">
              <Input name="staff_code" inputMode="numeric" pattern="[0-9]{4,8}" required />
            </Field>
            <Field label="主所属院">
              <Select name="primary_clinic_id" required defaultValue="">
                <option value="" disabled>
                  選択してください
                </option>
                {clinics.map((c) => (
                  <option key={c.clinic_id} value={c.clinic_id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="入社日" hint="主所属の開始日にもなります">
              <Input name="hire_date" type="date" defaultValue={todayJst()} required />
            </Field>
          </div>
          <StaffNameFields />
          <StaffPrivateFields />
        </ActionForm>
      </Card>
    </>
  );
}
