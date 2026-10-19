import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, Input, Select, Table, Td } from "@/components/ui";
import { isActiveOn } from "@/lib/data/types";
import { setEligibility } from "../actions";

export interface EligibilityRow {
  id: string;
  eligible: boolean;
  valid_from: string;
  valid_to: string | null;
  reason: string;
}

/** 振休（祝日勤務）の付与対象の設定。勤務制度名では判定せず、スタッフごとに本部が設定する */
export function EligibilityCard({ staffId, rows, today }: { staffId: string; rows: EligibilityRow[]; today: string }) {
  const current = rows.find((r) => isActiveOn(r, today));
  return (
    <Card title="振休（祝日勤務）の付与対象">
      <p className="mb-3 text-sm">
        現在：
        {current ? (
          current.eligible ? (
            <Badge tone="green">付与対象</Badge>
          ) : (
            <Badge>付与対象外</Badge>
          )
        ) : (
          <Badge tone="yellow">未設定（付与対象外として扱います）</Badge>
        )}
      </p>
      {rows.length > 0 && (
        <Table head={["期間", "設定", "理由"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                {r.valid_from} 〜 {r.valid_to ?? ""}
              </Td>
              <Td>{r.eligible ? "対象" : "対象外"}</Td>
              <Td className="whitespace-normal text-slate-600">{r.reason}</Td>
            </tr>
          ))}
        </Table>
      )}
      <ActionForm action={setEligibility} submitLabel="設定" className="mt-4 grid gap-4 sm:grid-cols-4">
        <input type="hidden" name="staff_id" value={staffId} />
        <Field label="設定">
          <Select name="eligible" defaultValue={current?.eligible === false ? "false" : "true"}>
            <option value="true">付与対象にする</option>
            <option value="false">付与対象外にする</option>
          </Select>
        </Field>
        <Field label="適用開始日">
          <Input name="valid_from" type="date" defaultValue={today} required />
        </Field>
        <div className="sm:col-span-2">
          <Field label="理由">
            <Input name="reason" placeholder="例：完全週休2日制のため対象外" required />
          </Field>
        </div>
      </ActionForm>
    </Card>
  );
}
