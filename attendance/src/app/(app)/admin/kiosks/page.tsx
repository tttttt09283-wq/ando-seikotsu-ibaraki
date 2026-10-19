import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import type { ClinicRow } from "@/lib/data/types";
import { formatJstDateTime } from "@/lib/time/jst";
import { disableDevice, issueRegistration } from "./actions";

interface DeviceRow {
  device_id: string;
  clinic_id: string;
  name: string;
  status: "pending" | "active" | "disabled";
  registration_expires_at: string | null;
  registered_at: string | null;
  last_seen_at: string | null;
}

const STATUS = { pending: ["登録待ち", "yellow"], active: ["稼働中", "green"], disabled: ["停止", "gray"] } as const;

/** 共用端末の登録・停止（本部のみ）。各院に1台以上設置する */
export default async function KiosksPage() {
  await requireHq();
  const supabase = await createSupabaseServer();
  const [{ data: deviceData }, { data: clinicData }] = await Promise.all([
    supabase.from("kiosk_devices").select("*").order("created_at"),
    supabase.from("clinics").select("clinic_id, name, status").neq("status", "closed").order("display_order"),
  ]);
  const devices = (deviceData ?? []) as DeviceRow[];
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name">[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));

  return (
    <>
      <PageHeader
        title="共用端末"
        description="各院のタブレット・PCを打刻端末として登録します。端末で /kiosk を開き、ここで発行した登録コードを入力すると有効になります。"
      />
      <Card title="登録済みの端末" className="mb-6">
        {devices.length === 0 ? (
          <EmptyState>端末が登録されていません</EmptyState>
        ) : (
          <Table head={["院", "端末名", "状態", "登録日時", "最終通信", ""]}>
            {devices.map((d) => (
              <tr key={d.device_id}>
                <Td>{clinicName.get(d.clinic_id) ?? "（閉鎖院）"}</Td>
                <Td className="font-medium">{d.name}</Td>
                <Td>
                  <Badge tone={STATUS[d.status][1]}>{STATUS[d.status][0]}</Badge>
                  {d.status === "pending" && d.registration_expires_at && (
                    <div className="mt-1 text-xs text-slate-500">コード期限 {formatJstDateTime(d.registration_expires_at)}</div>
                  )}
                </Td>
                <Td className="text-slate-600">{formatJstDateTime(d.registered_at) || "—"}</Td>
                <Td className="text-slate-600">{formatJstDateTime(d.last_seen_at) || "—"}</Td>
                <Td>
                  <div className="flex gap-2">
                    <ActionForm
                      action={issueRegistration}
                      submitLabel="再登録コード"
                      tone="secondary"
                      confirmMessage="新しい登録コードを発行します。今この端末は使えなくなります（端末の交換時に使います）。よろしいですか？"
                    >
                      <input type="hidden" name="clinic_id" value={d.clinic_id} />
                      <input type="hidden" name="name" value={d.name} />
                      <input type="hidden" name="device_id" value={d.device_id} />
                    </ActionForm>
                    {d.status !== "disabled" && (
                      <ActionForm action={disableDevice} submitLabel="停止" tone="danger" confirmMessage="この端末を停止します（紛失・廃棄時など）。よろしいですか？">
                        <input type="hidden" name="device_id" value={d.device_id} />
                      </ActionForm>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="端末を追加（登録コードを発行）">
        <ActionForm action={issueRegistration} submitLabel="登録コードを発行" resetOnSuccess className="grid gap-4 sm:grid-cols-3">
          <Field label="設置する院">
            <Select name="clinic_id" required defaultValue="">
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
          <Field label="端末名">
            <Input name="name" placeholder="例：受付タブレット" required />
          </Field>
        </ActionForm>
        <p className="mt-3 text-xs text-slate-500">
          端末は打刻専用の画面のみ表示します。iPad の「アクセスガイド」などで、この画面以外を開けないように固定することをおすすめします。
        </p>
      </Card>
    </>
  );
}
