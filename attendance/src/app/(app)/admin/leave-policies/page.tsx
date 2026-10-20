import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { saveHolidayCreditPolicy, saveLeavePolicy } from "./actions";

interface LeavePolicy {
  leave_type: "paid" | "holiday_credit" | "other";
  name: string;
  half_day_allowed: boolean;
  hourly_allowed: boolean;
  agreement_note: string | null;
}

interface CreditPolicy {
  credit_type: string;
  name: string;
  credited_days: string;
  min_worked_minutes: number;
  half_day_max_minutes: number;
  expiration_rule: "end_of_month" | "one_month" | "days" | "none";
  expiration_days: number | null;
  is_active: boolean;
  wage_note: string | null;
}

/** 休暇の設定（本部）。区分ごとの付与条件・期限が未設定の間は正式付与しない */
export default async function LeavePoliciesPage() {
  await requireHq();
  const supabase = await createSupabaseServer();
  const [{ data: leaveData }, { data: creditData }] = await Promise.all([
    supabase.from("leave_policies").select("*").order("leave_type"),
    supabase.from("holiday_credit_policies").select("*").neq("credit_type", "migration").order("credit_type", { ascending: false }),
  ]);
  const leavePolicies = (leaveData ?? []) as LeavePolicy[];
  const creditPolicies = (creditData ?? []) as CreditPolicy[];

  return (
    <>
      <PageHeader title="休暇の設定" description="変更は監査ログに記録されます。" />
      <div className="space-y-6">
        <Card title="休暇の種類">
          <div className="space-y-4">
            {leavePolicies.map((p) => (
              <ActionForm key={p.leave_type} action={saveLeavePolicy} submitLabel="保存" tone="secondary" resetOnSuccess={false} className="flex flex-wrap items-end gap-4 border-b border-slate-100 pb-4">
                <input type="hidden" name="leave_type" value={p.leave_type} />
                <span className="w-44 font-medium">{p.name}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="half_day_allowed" defaultChecked={p.half_day_allowed} /> 半日単位を許可
                </label>
                {p.leave_type === "paid" && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="hourly_allowed" defaultChecked={p.hourly_allowed} /> 時間単位年休（労使協定あり）
                    </label>
                    <Field label="労使協定の内容">
                      <Input name="agreement_note" defaultValue={p.agreement_note ?? ""} placeholder="締結日・対象者・上限日数" className="w-72" />
                    </Field>
                  </>
                )}
              </ActionForm>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">時間単位年休は、ここで有効にしたうえで、スタッフの勤務条件でも有効にした人だけが申請できます（年5日まで）。</p>
        </Card>

        <Card title="祝日勤務に伴う休日の区分">
          <div className="space-y-4">
            {creditPolicies.map((p) => (
              <ActionForm key={p.credit_type} action={saveHolidayCreditPolicy} submitLabel="保存" tone="secondary" resetOnSuccess={false} className="grid gap-3 border-b border-slate-100 pb-4 sm:grid-cols-6">
                <input type="hidden" name="credit_type" value={p.credit_type} />
                <div className="sm:col-span-6">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2">{p.is_active ? <Badge tone="green">正式付与中</Badge> : <Badge>未設定（付与しない）</Badge>}</span>
                  {p.wage_note && <p className="mt-1 text-xs text-slate-500">{p.wage_note}</p>}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_active" defaultChecked={p.is_active} /> 正式付与を行う
                </label>
                <Field label="付与に必要な最低勤務（分）">
                  <Input name="min_worked_minutes" type="number" min={1} defaultValue={p.min_worked_minutes} />
                </Field>
                <Field label="0.5日になる勤務（分以下）" hint="既定240分＝4時間以下は半日">
                  <Input name="half_day_max_minutes" type="number" min={0} defaultValue={p.half_day_max_minutes} />
                </Field>
                <Field label="期限">
                  <Select name="expiration_rule" defaultValue={p.expiration_rule}>
                    <option value="end_of_month">勤務日の月末</option>
                    <option value="one_month">勤務日から1か月</option>
                    <option value="days">勤務日から○日</option>
                    <option value="none">期限なし</option>
                  </Select>
                </Field>
                <Field label="日数（○日の場合）">
                  <Input name="expiration_days" type="number" min={1} defaultValue={p.expiration_days ?? ""} />
                </Field>
              </ActionForm>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
