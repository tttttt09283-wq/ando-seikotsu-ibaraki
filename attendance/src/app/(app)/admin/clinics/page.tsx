import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { CLINIC_STATUS_LABELS, type ClinicRow } from "@/lib/data/types";
import { todayJst } from "@/lib/time/jst";
import { changeClinicStatus, createClinic, renameClinic } from "./actions";

const statusTone = { active: "green", suspended: "yellow", closed: "gray" } as const;

export default async function ClinicsPage() {
  await requireHq();
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("clinics").select("*").order("display_order").order("clinic_code");
  const clinics = (data ?? []) as ClinicRow[];
  const today = todayJst();

  return (
    <>
      <PageHeader
        title="店舗マスタ"
        description="院は削除せず、休止・閉鎖で管理します。院名を変えても店舗IDは変わらず、過去の勤怠履歴はそのまま残ります。"
      />

      <Card title={`登録店舗（${clinics.length}院）`} className="mb-6">
        <Table head={["院コード", "院名", "状態", "開院日", "院名の変更", "状態の変更"]}>
          {clinics.map((c) => (
            <tr key={c.clinic_id}>
              <Td className="font-mono text-xs">{c.clinic_code}</Td>
              <Td className="font-medium">
                {c.name}
                <Link href={`/clinics/${c.clinic_id}`} className="mt-1 block text-xs font-normal text-brand-700 underline">
                  診療時間・休診日
                </Link>
              </Td>
              <Td>
                <Badge tone={statusTone[c.status]}>{CLINIC_STATUS_LABELS[c.status]}</Badge>
                {c.status === "suspended" && <div className="mt-1 text-xs text-slate-500">{c.suspended_on} から</div>}
                {c.status === "closed" && <div className="mt-1 text-xs text-slate-500">{c.closed_on} 閉鎖</div>}
              </Td>
              <Td>{c.opened_on ?? "—"}</Td>
              <Td>
                <ActionForm action={renameClinic} submitLabel="変更" tone="secondary" className="flex gap-2">
                  <input type="hidden" name="clinic_id" value={c.clinic_id} />
                  <Input name="name" defaultValue={c.name} aria-label={`${c.name}の新しい院名`} className="w-40" required />
                </ActionForm>
              </Td>
              <Td>
                <ActionForm
                  action={changeClinicStatus}
                  submitLabel="適用"
                  tone="secondary"
                  className="flex flex-wrap gap-2"
                  confirmMessage={`${c.name} の状態を変更します。よろしいですか？`}
                >
                  <input type="hidden" name="clinic_id" value={c.clinic_id} />
                  <Select name="status" defaultValue={c.status} aria-label="状態" className="w-24">
                    <option value="active">営業中</option>
                    <option value="suspended">休止</option>
                    <option value="closed">閉鎖</option>
                  </Select>
                  <Input name="effective_date" type="date" defaultValue={today} aria-label="適用日" className="w-36" />
                  <Input name="reason" placeholder="理由（必須）" aria-label="理由" className="w-40" required />
                </ActionForm>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="店舗を追加">
        <ActionForm action={createClinic} submitLabel="追加" className="grid gap-4 sm:grid-cols-4">
          <Field label="院コード" hint="英大文字・数字（例：HIRAKATA）。帳票・連携のキーになります">
            <Input name="clinic_code" required />
          </Field>
          <Field label="院名">
            <Input name="name" required />
          </Field>
          <Field label="開院日">
            <Input name="opened_on" type="date" />
          </Field>
          <Field label="表示順">
            <Input name="display_order" type="number" min={0} defaultValue={(clinics.length + 1) * 10} />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
