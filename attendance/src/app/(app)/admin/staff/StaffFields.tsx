import { Field, Input, Textarea } from "@/components/ui";
import type { StaffPrivateRow, StaffRow } from "@/lib/data/types";

/** スタッフ登録・編集で共通の入力欄（氏名・入社日・個人情報） */
export function StaffNameFields({ staff }: { staff?: StaffRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Field label="姓">
        <Input name="family_name" defaultValue={staff?.family_name} required />
      </Field>
      <Field label="名">
        <Input name="given_name" defaultValue={staff?.given_name} required />
      </Field>
      <Field label="姓（カナ）">
        <Input name="family_name_kana" defaultValue={staff?.family_name_kana ?? ""} />
      </Field>
      <Field label="名（カナ）">
        <Input name="given_name_kana" defaultValue={staff?.given_name_kana ?? ""} />
      </Field>
    </div>
  );
}

export function StaffPrivateFields({ details }: { details?: StaffPrivateRow | null }) {
  return (
    <fieldset className="rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-medium text-slate-700">
        個人情報 <span className="text-xs font-normal text-slate-500">（本部・主所属院の院長・本人のみ閲覧可）</span>
      </legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="生年月日">
          <Input name="birth_date" type="date" defaultValue={details?.birth_date ?? ""} />
        </Field>
        <Field label="電話番号">
          <Input name="phone" type="tel" defaultValue={details?.phone ?? ""} />
        </Field>
        <Field label="メールアドレス">
          <Input name="email" type="email" defaultValue={details?.email ?? ""} />
        </Field>
        <Field label="郵便番号">
          <Input name="postal_code" defaultValue={details?.postal_code ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="住所">
            <Input name="address" defaultValue={details?.address ?? ""} />
          </Field>
        </div>
        <Field label="緊急連絡先（氏名）">
          <Input name="emergency_contact_name" defaultValue={details?.emergency_contact_name ?? ""} />
        </Field>
        <Field label="緊急連絡先（電話）">
          <Input name="emergency_contact_phone" type="tel" defaultValue={details?.emergency_contact_phone ?? ""} />
        </Field>
        <div className="sm:col-span-3">
          <Field label="備考">
            <Textarea name="notes" rows={2} defaultValue={details?.notes ?? ""} />
          </Field>
        </div>
      </div>
    </fieldset>
  );
}
