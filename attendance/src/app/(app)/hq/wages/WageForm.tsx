import { ActionForm } from "@/components/ActionForm";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { WageRow } from "@/lib/payroll/load";
import { saveWage } from "./actions";

/** 賃金の入力欄（適用開始月つき。同じ月は上書き、別の月は履歴に追加） */
export function WageForm({ staffId, current, defaultMonth }: { staffId: string; current: WageRow | null; defaultMonth: string }) {
  const n = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
  return (
    <ActionForm action={saveWage} submitLabel="保存" resetOnSuccess={false} className="space-y-4">
      <input type="hidden" name="staff_id" value={staffId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="適用開始月" hint="昇給・変更はその月から。過去の月は前の賃金で計算">
          <Input type="month" name="valid_from" defaultValue={defaultMonth} required />
        </Field>
        <Field label="給与形態">
          <Select name="pay_type" defaultValue={current?.pay_type ?? "monthly"}>
            <option value="monthly">月給</option>
            <option value="hourly">時給</option>
            <option value="daily">日給</option>
          </Select>
        </Field>
      </div>
      <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium text-slate-700">月給の場合</legend>
        <Field label="基礎賃金（円）" hint="基本給＋資格手当＋役職手当（＋家族手当）">
          <Input name="basic_wage" inputMode="numeric" defaultValue={n(current?.basic_wage)} />
        </Field>
        <Field label="うち資格・役職手当（円）" hint="内訳の参考（基礎賃金に含める）">
          <Input name="qualification_allowance" inputMode="numeric" defaultValue={n(current?.qualification_allowance)} />
        </Field>
        <Field label="月の所定時間" hint="基本時給＝基礎賃金÷この時間（例：151）">
          <Input name="monthly_hours" inputMode="decimal" defaultValue={n(current?.monthly_hours)} />
        </Field>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="時給（円）">
          <Input name="hourly_wage" inputMode="numeric" defaultValue={n(current?.hourly_wage)} />
        </Field>
        <Field label="日給（円）">
          <Input name="daily_wage" inputMode="numeric" defaultValue={n(current?.daily_wage)} />
        </Field>
        <Field label="残業の基準時間" hint="月の合計がこの時間（＋固定残業時間）を超えた分が超過残業。空欄＝月の所定時間（時給・日給は法定時間外）">
          <Input name="overtime_threshold_hours" inputMode="decimal" defaultValue={n(current?.overtime_threshold_hours)} />
        </Field>
        <Field label="固定残業代（円／月）" hint="固定残業時間は「スタッフ → 勤務条件」のみなし残業">
          <Input name="fixed_overtime_allowance" inputMode="numeric" defaultValue={n(current?.fixed_overtime_allowance)} />
        </Field>
        <Field label="雑手当（円／月）" hint="毎月の既定額。月ごとに上書きできます">
          <Input name="misc_allowance" inputMode="numeric" defaultValue={n(current?.misc_allowance)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="交通費">
          <Select name="commute_type" defaultValue={current?.commute_type ?? "none"}>
            <option value="none">なし</option>
            <option value="monthly">月額</option>
            <option value="per_day">日額×出勤日数</option>
          </Select>
        </Field>
        <Field label="交通費の金額（円）">
          <Input name="commute_amount" inputMode="numeric" defaultValue={n(current?.commute_amount)} />
        </Field>
      </div>
      <Field label="備考">
        <Textarea name="note" rows={2} defaultValue={current?.note ?? ""} />
      </Field>
    </ActionForm>
  );
}
