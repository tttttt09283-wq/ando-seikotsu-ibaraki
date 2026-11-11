import { ActionForm, SubmitButton, type ActionState } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/input";
import type { StaffOption } from "@/lib/org-data";

type Customer = {
  id: string;
  store_id: string;
  customer_code: string;
  family_name: string;
  given_name: string;
  family_name_kana: string;
  given_name_kana: string;
  phone: string | null;
  email: string | null;
  assigned_staff_id: string | null;
};

export function CustomerForm({
  action,
  orgSlug,
  stores,
  staff,
  customer,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  orgSlug: string;
  stores: { id: string; name: string }[];
  staff: StaffOption[];
  customer?: Customer;
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {customer && <input type="hidden" name="customerId" value={customer.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="姓（必須）" htmlFor="familyName">
          <Input id="familyName" name="familyName" required maxLength={50} defaultValue={customer?.family_name} autoComplete="off" />
        </Field>
        <Field label="名" htmlFor="givenName">
          <Input id="givenName" name="givenName" maxLength={50} defaultValue={customer?.given_name} autoComplete="off" />
        </Field>
        <Field label="せい" htmlFor="familyNameKana">
          <Input id="familyNameKana" name="familyNameKana" maxLength={50} defaultValue={customer?.family_name_kana} autoComplete="off" />
        </Field>
        <Field label="めい" htmlFor="givenNameKana">
          <Input id="givenNameKana" name="givenNameKana" maxLength={50} defaultValue={customer?.given_name_kana} autoComplete="off" />
        </Field>
      </div>
      <Field label="電話番号" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" inputMode="tel" maxLength={20} defaultValue={customer?.phone ?? ""} autoComplete="off" />
      </Field>
      <Field label="メールアドレス" htmlFor="email">
        <Input id="email" name="email" type="email" maxLength={254} defaultValue={customer?.email ?? ""} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="所属店舗" htmlFor="storeId">
          <Select id="storeId" name="storeId" defaultValue={customer?.store_id ?? stores[0]?.id} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="担当スタッフ" htmlFor="assignedStaffId">
          <Select id="assignedStaffId" name="assignedStaffId" defaultValue={customer?.assigned_staff_id ?? ""}>
            <option value="">未設定</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="顧客番号" htmlFor="customerCode" hint={customer ? undefined : "空欄の場合は自動で採番します"}>
        <Input id="customerCode" name="customerCode" maxLength={30} pattern="[A-Za-z0-9_\-]*" defaultValue={customer?.customer_code ?? ""} />
      </Field>
      {!customer && (
        <Field label="連絡同意" htmlFor="consent" hint="店頭で確認できた場合に選択してください。未確認のままでは連絡タスクの対象外です。">
          <Select id="consent" name="consent" defaultValue="">
            <option value="">未確認</option>
            <option value="granted">同意あり</option>
            <option value="not_allowed">連絡不可</option>
          </Select>
        </Field>
      )}
      <p className="text-xs text-muted-foreground">症状・傷病名などの医療情報は登録しないでください。</p>
      <SubmitButton size="lg">{customer ? "保存する" : "登録する"}</SubmitButton>
    </ActionForm>
  );
}
