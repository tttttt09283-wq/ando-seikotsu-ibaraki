import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, Select, Table, Td } from "@/components/ui";
import { isActiveOn, minutesToHours, type ContractRow } from "@/lib/data/types";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/validation/schemas";
import { saveContract } from "../actions";

/** 勤務条件（雇用契約）の履歴と登録フォーム。変更は本部のみ */
export function ContractCard({ staffId, contracts, today }: { staffId: string; contracts: ContractRow[]; today: string }) {
  const current = contracts.find((c) => isActiveOn(c, today));

  return (
    <Card title="勤務条件（雇用契約）">
      {contracts.length === 0 ? (
        <EmptyState>勤務条件が未登録です。勤怠の集計（残業・みなし残業の超過分）に必要なため登録してください。</EmptyState>
      ) : (
        <Table head={["期間", "雇用形態", "週の勤務日数", "1日の所定", "週の所定", "みなし残業（月）", "週の法定", "理由・備考"]}>
          {contracts.map((c) => (
            <tr key={c.contract_id}>
              <Td>
                {c.valid_from} 〜 {c.valid_to ?? ""}
                {isActiveOn(c, today) && (
                  <span className="ml-2">
                    <Badge tone="green">現在</Badge>
                  </span>
                )}
              </Td>
              <Td>{EMPLOYMENT_TYPE_LABELS[c.employment_type]}</Td>
              <Td>{Number(c.weekly_scheduled_days)}日</Td>
              <Td>{minutesToHours(c.daily_scheduled_minutes)}</Td>
              <Td>{minutesToHours(c.weekly_scheduled_minutes)}</Td>
              <Td>{c.fixed_overtime_minutes > 0 ? minutesToHours(c.fixed_overtime_minutes) : "なし"}</Td>
              <Td>{minutesToHours(c.legal_weekly_limit_minutes)}</Td>
              <Td className="text-slate-600">{c.note ?? ""}</Td>
            </tr>
          ))}
        </Table>
      )}

      <h3 className="mb-1 mt-6 text-sm font-bold">登録・変更</h3>
      <p className="mb-3 text-xs text-slate-500">
        新しい適用開始日で登録すると、現在の条件は前日で終了します。同じ適用開始日で登録すると訂正になります（いずれも理由が監査ログに残ります）。
        みなし残業を空欄にすると、正社員は月24時間・それ以外は0時間になります。
      </p>
      <ActionForm action={saveContract} submitLabel="保存" resetOnSuccess={false} className="grid gap-4 sm:grid-cols-4">
        <input type="hidden" name="staff_id" value={staffId} />
        <Field label="適用開始日">
          <Input name="valid_from" type="date" defaultValue={current ? today : ""} required />
        </Field>
        <Field label="雇用形態">
          <Select name="employment_type" defaultValue={current?.employment_type ?? "full_time"}>
            {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="週の勤務日数（日）">
          <Input name="weekly_scheduled_days" type="number" step="0.5" min={0} max={7} defaultValue={Number(current?.weekly_scheduled_days ?? 5)} required />
        </Field>
        <Field label="1日の所定労働時間（時間）">
          <Input name="daily_scheduled_minutes" type="number" step="0.25" min={0} max={24} defaultValue={(current?.daily_scheduled_minutes ?? 480) / 60} required />
        </Field>
        <Field label="週の所定労働時間（時間）">
          <Input name="weekly_scheduled_minutes" type="number" step="0.25" min={0} max={168} defaultValue={(current?.weekly_scheduled_minutes ?? 2400) / 60} required />
        </Field>
        <Field label="みなし残業（月・時間）" hint="空欄＝雇用形態の標準">
          <Input
            name="fixed_overtime_minutes"
            type="number"
            step="0.25"
            min={0}
            max={100}
            defaultValue={current ? current.fixed_overtime_minutes / 60 : ""}
          />
        </Field>
        <Field label="週の法定労働時間">
          <Select name="legal_weekly_limit_minutes" defaultValue={String(current?.legal_weekly_limit_minutes ?? 2400)}>
            <option value="2400">40時間</option>
            <option value="2640">44時間（特例措置対象事業場）</option>
          </Select>
        </Field>
        <Field label="理由">
          <Input name="reason" placeholder="例：入社時の契約、みなし時間の見直し" required />
        </Field>
      </ActionForm>
    </Card>
  );
}
