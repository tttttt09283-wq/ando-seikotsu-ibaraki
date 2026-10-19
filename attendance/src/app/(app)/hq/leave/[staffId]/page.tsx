import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { staffName, type StaffRow } from "@/lib/data/types";
import { formatJstDateTime, todayJst } from "@/lib/time/jst";
import { adjustPaidLeave, grantPaidLeave } from "../actions";
import { EligibilityCard, type EligibilityRow } from "./EligibilityCard";

interface GrantRow {
  leave_grant_id: string;
  grant_date: string;
  granted_days: string;
  used_days: string;
  expired_days: string;
  adjusted_days: string;
  expiration_date: string;
  grant_type: string;
  annual_5day_target: boolean;
  note: string | null;
}

interface EntryRow {
  entry_id: string;
  leave_grant_id: string;
  entry_type: "grant" | "use" | "use_reversal" | "expire" | "adjust";
  days: string;
  effective_date: string;
  note: string | null;
  created_at: string;
}

interface CreditRow {
  holiday_credit_id: string;
  entry_type: string;
  bucket_id: string | null;
  source_work_date: string | null;
  credited_days: string;
  expiration_date: string | null;
  effective_date: string;
  note: string | null;
}

const GRANT_TYPES = { statutory: "法定", proportional: "比例", advance: "前倒し", manual: "手動", migration: "移行" } as const;
const ENTRY_TYPES = { grant: "付与", use: "取得", use_reversal: "取得の取消（戻し）", expire: "失効", adjust: "調整" } as const;
const CREDIT_ENTRY_TYPES: Record<string, string> = { grant: "付与", use: "取得", use_reversal: "取得の取消", expire: "失効", revoke: "付与の取消", adjust: "調整" };

/** スタッフ別の休暇台帳（本部）。付与単位ごとの残数と、すべての増減の履歴 */
export default async function StaffLeaveLedgerPage({ params }: { params: Promise<{ staffId: string }> }) {
  await requireHq();
  const { staffId } = await params;
  if (!z.uuid().safeParse(staffId).success) notFound();
  const supabase = await createSupabaseServer();
  const today = todayJst();
  const [{ data: staff }, { data: grantData }, { data: entryData }, { data: creditData }, { data: eligibilityData }] = await Promise.all([
    supabase.from("staff_profiles").select("*").eq("staff_id", staffId).maybeSingle(),
    supabase.from("leave_grants").select("*").eq("staff_id", staffId).order("grant_date", { ascending: false }),
    supabase.from("leave_ledger_entries").select("*").eq("staff_id", staffId).order("created_at", { ascending: false }),
    supabase.from("holiday_credit_ledger").select("*").eq("staff_id", staffId).order("created_at", { ascending: false }),
    supabase.from("staff_holiday_credit_eligibility").select("*").eq("staff_id", staffId).order("valid_from", { ascending: false }),
  ]);
  if (!staff) notFound();
  const s = staff as StaffRow;
  const grants = (grantData ?? []) as GrantRow[];
  const entries = (entryData ?? []) as EntryRow[];
  const credits = (creditData ?? []) as CreditRow[];
  const remainingOf = (g: GrantRow) => Number(g.granted_days) + Number(g.adjusted_days) - Number(g.used_days) - Number(g.expired_days);
  const grantLabel = new Map(grants.map((g) => [g.leave_grant_id, `${g.grant_date}付与`]));

  return (
    <>
      <PageHeader
        title={`休暇台帳：${staffName(s)}（${s.staff_code}）`}
        description={`入社日 ${s.hire_date}`}
        actions={
          <Link href="/hq/leave" className="text-sm text-brand-700 underline">
            有給台帳へ戻る
          </Link>
        }
      />
      <div className="space-y-6">
        <Card title="有給休暇：付与ごとの残数">
          {grants.length === 0 ? (
            <EmptyState>付与がありません</EmptyState>
          ) : (
            <Table head={["付与日", "種類", "付与", "取得", "失効", "調整", "残り", "有効期限", "調整（本部）"]}>
              {grants.map((g) => (
                <tr key={g.leave_grant_id} className={g.expiration_date < today ? "text-slate-400" : ""}>
                  <Td>
                    {g.grant_date}
                    {g.annual_5day_target && (
                      <span className="ml-1">
                        <Badge tone="blue">年5日対象</Badge>
                      </span>
                    )}
                  </Td>
                  <Td>{GRANT_TYPES[g.grant_type as keyof typeof GRANT_TYPES]}</Td>
                  <Td>{Number(g.granted_days)}日</Td>
                  <Td>{Number(g.used_days)}日</Td>
                  <Td>{Number(g.expired_days)}日</Td>
                  <Td>{Number(g.adjusted_days)}日</Td>
                  <Td className="font-bold">{remainingOf(g)}日</Td>
                  <Td>{g.expiration_date}</Td>
                  <Td>
                    <ActionForm action={adjustPaidLeave} submitLabel="調整" tone="secondary" className="flex gap-1">
                      <input type="hidden" name="staff_id" value={staffId} />
                      <input type="hidden" name="leave_grant_id" value={g.leave_grant_id} />
                      <input type="hidden" name="effective_date" value={today} />
                      <Input name="days" type="number" step="0.5" placeholder="±日" className="w-20" required />
                      <Input name="reason" placeholder="理由" className="w-28" required />
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="有給休暇を付与（手動・既存残数の移行）">
          <ActionForm action={grantPaidLeave} submitLabel="付与" className="grid gap-4 sm:grid-cols-6">
            <input type="hidden" name="staff_id" value={staffId} />
            <Field label="付与日">
              <Input name="grant_date" type="date" required />
            </Field>
            <Field label="日数">
              <Input name="days" type="number" step="0.5" min={0.5} max={40} required />
            </Field>
            <Field label="種類">
              <Select name="grant_type" defaultValue="migration">
                {Object.entries(GRANT_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="有効期限" hint="空欄＝付与日から2年">
              <Input name="expiration_date" type="date" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="備考">
                <Input name="note" placeholder="例：旧システムからの移行（残日数）" />
              </Field>
            </div>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">過去日付の付与は監査ログに「過去日付」として記録されます。</p>
        </Card>

        <Card title="有給休暇：台帳の履歴">
          {entries.length === 0 ? (
            <EmptyState>履歴がありません</EmptyState>
          ) : (
            <Table head={["日付", "内容", "日数", "対象の付与", "備考", "記録日時"]}>
              {entries.map((e) => (
                <tr key={e.entry_id}>
                  <Td>{e.effective_date}</Td>
                  <Td>{ENTRY_TYPES[e.entry_type]}</Td>
                  <Td className={Number(e.days) < 0 ? "text-rose-700" : "text-emerald-700"}>
                    {Number(e.days) > 0 ? "+" : ""}
                    {Number(e.days)}日
                  </Td>
                  <Td>{grantLabel.get(e.leave_grant_id)}</Td>
                  <Td className="whitespace-normal text-slate-600">{e.note ?? ""}</Td>
                  <Td className="text-slate-500">{formatJstDateTime(e.created_at)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <EligibilityCard staffId={staffId} rows={(eligibilityData ?? []) as EligibilityRow[]} today={today} />

        <Card title="振休：台帳の履歴">
          {credits.length === 0 ? (
            <EmptyState>振休の履歴はありません</EmptyState>
          ) : (
            <Table head={["日付", "内容", "日数", "祝日", "期限", "備考"]}>
              {credits.map((c) => (
                <tr key={c.holiday_credit_id}>
                  <Td>{c.effective_date}</Td>
                  <Td>{CREDIT_ENTRY_TYPES[c.entry_type]}</Td>
                  <Td className={Number(c.credited_days) < 0 ? "text-rose-700" : "text-emerald-700"}>
                    {Number(c.credited_days) > 0 ? "+" : ""}
                    {Number(c.credited_days)}日
                  </Td>
                  <Td>{c.source_work_date ?? credits.find((g) => g.holiday_credit_id === c.bucket_id)?.source_work_date ?? ""}</Td>
                  <Td>{c.entry_type === "grant" ? (c.expiration_date ?? "なし") : ""}</Td>
                  <Td className="whitespace-normal text-slate-600">{c.note ?? ""}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
