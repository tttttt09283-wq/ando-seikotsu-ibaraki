import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge, Card, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { isActiveOn, type ClinicRow, type RoleGrantRow } from "@/lib/data/types";
import type { OverviewRow } from "@/lib/kit/plan";
import { todayJst } from "@/lib/time/jst";

interface DeviceRow {
  clinic_id: string;
  status: "pending" | "active" | "disabled";
}

/**
 * 各院に配る「使い始めセット」（本部のみ）。
 * 院ごとに、打刻端末の登録コード（QR コード付き）・スタッフの PIN 配布票・院長のログイン案内を1つの Excel にまとめて作る。
 */
export default async function KitsPage() {
  await requireHq();
  const supabase = await createSupabaseServer();
  const today = todayJst();
  const [{ data: clinicData }, { data: deviceData }, { data: roleData }] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name, status").neq("status", "closed").order("display_order"),
    supabase.from("kiosk_devices").select("clinic_id, status"),
    supabase.from("user_roles").select("*").eq("role", "clinic_manager"),
  ]);
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name">[];
  const devices = (deviceData ?? []) as DeviceRow[];
  const roles = ((roleData ?? []) as RoleGrantRow[]).filter((r) => isActiveOn(r, today));
  const overviews = await Promise.all(
    clinics.map(async (c) => ((await supabase.rpc("clinic_pin_overview", { p_clinic_id: c.clinic_id })).data ?? []) as OverviewRow[]),
  );

  return (
    <>
      <PageHeader
        title="使い始めセット"
        description="院ごとに、打刻端末の登録コード（QRコード付き）・スタッフのPIN配布票・院長のログイン案内を1つのExcelにまとめて作ります。各院へデータで送り、院で印刷・設定してもらいます。"
      />

      <Card title="各院の準備状況" className="mb-6">
        <Table head={["院", "打刻端末", "院長アカウント", "スタッフ", "PIN未発行"]}>
          {clinics.map((c, i) => {
            const active = devices.filter((d) => d.clinic_id === c.clinic_id && d.status === "active").length;
            const pending = devices.filter((d) => d.clinic_id === c.clinic_id && d.status === "pending").length;
            const managers = roles.filter((r) => r.clinic_id === c.clinic_id).length;
            const staff = overviews[i];
            const missing = staff.filter((s) => !s.has_pin).length;
            return (
              <tr key={c.clinic_id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>
                  {active > 0 ? <Badge tone="green">稼働中 {active}台</Badge> : <Badge tone="red">未設定</Badge>}
                  {pending > 0 && (
                    <span className="ml-2">
                      <Badge tone="yellow">登録待ち {pending}台</Badge>
                    </span>
                  )}
                </Td>
                <Td>{managers > 0 ? `${managers}人` : <Badge tone="red">なし</Badge>}</Td>
                <Td>{staff.length}人</Td>
                <Td>{missing > 0 ? <Badge tone="red">{missing}人</Badge> : <Badge tone="green">なし</Badge>}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="セットを作る（Excel をダウンロード）">
        <form method="post" action="/admin/kits/download" className="grid gap-4 sm:grid-cols-2">
          <Field label="院">
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
          <Field label="スタッフのPIN">
            <Select name="pin_mode" defaultValue="missing">
              <option value="missing">未発行のスタッフだけ発行する</option>
              <option value="all">全員に新しいPINを発行する（今のPINは使えなくなる）</option>
              <option value="none">発行しない（一覧だけ載せる）</option>
            </Select>
          </Field>
          <Field label="打刻端末の登録コード">
            <Select name="device_mode" defaultValue="new">
              <option value="new">発行する（QRコード付き）</option>
              <option value="none">発行しない（登録済みの端末を使う）</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="端末名" hint="同じ名前の登録待ちの端末があれば、そのコードを出し直します">
              <Input name="device_name" defaultValue="受付タブレット" maxLength={40} required />
            </Field>
            <Field label="登録コードの有効期限">
              <Select name="valid_days" defaultValue="7">
                {[1, 3, 7].map((d) => (
                  <option key={d} value={d}>
                    {d}日
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
              セットを作ってダウンロード
            </button>
          </div>
        </form>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-600">
          <li>PINと登録コードはこのファイルにだけ載ります（システムには暗号化した形でしか残りません）。作り直すと新しいPIN・コードになります。</li>
          <li>ファイルは院長だけに送り、配布と端末の設定が終わったら削除してもらってください。院長のパスワードはファイルに載せないので、別の方法で伝えてください。</li>
          <li>ダウンロード後にこのページを再読み込みすると、上の準備状況が更新されます。</li>
        </ul>
      </Card>
    </>
  );
}
