import { requireManager } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Input, PageHeader, Table, Td } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import { hm } from "@/lib/attendance/labels";
import { staffName, type StaffRow } from "@/lib/data/types";
import { addDays, isValidMonth, todayJst } from "@/lib/time/jst";
import { changeExpiration, decideHolidayCredit, expireCredits, generateCandidates } from "./actions";

interface CreditRequestRow {
  request_id: string;
  staff_id: string;
  source_work_date: string;
  source_worked_minutes: number;
  credited_days: string;
  status: "candidate" | "pending" | "approved" | "rejected" | "cancelled";
  report_reason: string | null;
  reject_reason: string | null;
  cancel_reason: string | null;
}

interface LedgerRow {
  holiday_credit_id: string;
  staff_id: string;
  entry_type: string;
  bucket_id: string | null;
  request_id: string | null;
  source_work_date: string | null;
  credited_days: string;
  expiration_date: string | null;
}

interface Inconsistency {
  request_id: string;
  staff_id: string;
  source_work_date: string;
  issue: "no_work" | "not_holiday" | "not_eligible" | "attendance_changed" | "days_changed";
  current_worked_minutes: number;
}

const ISSUE_LABELS = {
  no_work: "勤務実績がなくなった",
  not_holiday: "対象祝日ではなくなった",
  not_eligible: "付与対象外になった",
  attendance_changed: "付与後に勤怠が修正された",
  days_changed: "付与日数が変わる修正（1日⇔0.5日）",
} as const;

/**
 * 振休（祝日勤務）。祝日に勤務して当日休めなかった分を院長が報告し、本部が承認すると1日付与（期限は原則その月末）。
 * 付与対象はスタッフ別の設定で判定し、勤務制度名では判定しない。
 */
export default async function HolidayCreditsPage({ searchParams }: { searchParams: Promise<{ clinic?: string; month?: string }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? clinics[0]?.clinic_id;
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const hq = isHq(actor);
  const today = todayJst();
  const month = params.month && isValidMonth(params.month) ? params.month : today.slice(0, 7);

  const [{ data: requestData }, { data: inconsistencyData }] = await Promise.all([
    supabase.from("holiday_credit_requests").select("*").eq("home_clinic_id", clinicId).order("source_work_date", { ascending: false }).limit(300),
    supabase.rpc("holiday_credit_inconsistencies", { p_clinic_id: clinicId }),
  ]);
  const requests = (requestData ?? []) as CreditRequestRow[];
  const inconsistencies = (inconsistencyData ?? []) as Inconsistency[];
  const staffIds = [...new Set(requests.map((r) => r.staff_id))];
  const [{ data: staffData }, { data: ledgerData }] = staffIds.length
    ? await Promise.all([
        supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", staffIds),
        supabase.from("holiday_credit_ledger").select("*").in("staff_id", staffIds),
      ])
    : [{ data: [] }, { data: [] }];
  const staffById = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_id, s]));
  const ledger = (ledgerData ?? []) as LedgerRow[];
  const name = (id: string) => {
    const s = staffById.get(id);
    return s ? staffName(s) : "—";
  };

  const grants = ledger
    .filter((l) => l.entry_type === "grant")
    .map((g) => ({
      ...g,
      remaining: Number(g.credited_days) + ledger.filter((l) => l.bucket_id === g.holiday_credit_id).reduce((sum, l) => sum + Number(l.credited_days), 0),
    }));
  const active = grants.filter((g) => g.remaining > 0 && (g.expiration_date === null || g.expiration_date >= today));
  const expiring = grants.filter((g) => g.remaining > 0 && g.expiration_date !== null && g.expiration_date < today);

  const candidates = requests.filter((r) => r.status === "candidate");
  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => ["approved", "rejected", "cancelled"].includes(r.status)).slice(0, 50);

  const decision = (r: CreditRequestRow, d: "submit" | "approve" | "reject" | "revoke", label: string, placeholder?: string) => (
    <ActionForm action={decideHolidayCredit} submitLabel={label} tone={d === "approve" || d === "submit" ? "primary" : "secondary"} className="flex gap-2">
      <input type="hidden" name="request_id" value={r.request_id} />
      <input type="hidden" name="clinic_id" value={clinicId} />
      <input type="hidden" name="decision" value={d} />
      {placeholder && <Input name="comment" placeholder={placeholder} className="w-56" required />}
    </ActionForm>
  );

  return (
    <>
      <PageHeader
        title="振休（祝日勤務）"
        description="祝日の振休は原則当日に使用します。祝日に勤務して当日休めなかった場合、院長が理由を付けて本部に報告し、本部の承認で付与されます（4時間以下の半日勤務は0.5日、それ以外は1日。期限は原則その月末）。"
      />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <form method="get" className="flex items-center gap-2">
          <select name="clinic" defaultValue={clinicId} aria-label="院" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            {clinics.map((c) => (
              <option key={c.clinic_id} value={c.clinic_id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="month" name="month" defaultValue={month} aria-label="年月" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            表示
          </button>
        </form>
        <ActionForm action={generateCandidates} submitLabel="祝日勤務の候補を確認" tone="secondary" className="flex items-center gap-3">
          <input type="hidden" name="clinic_id" value={clinicId} />
          <input type="hidden" name="month" value={month} />
        </ActionForm>
      </div>

      <div className="space-y-6">
        {inconsistencies.length > 0 && (
          <Card title={`付与と勤怠の不整合（${inconsistencies.length}件）`} className="border-rose-300">
            <Table head={["スタッフ", "祝日", "内容", "現在の実労働", ""]}>
              {inconsistencies.map((i) => (
                <tr key={i.request_id}>
                  <Td>{name(i.staff_id)}</Td>
                  <Td>{i.source_work_date}</Td>
                  <Td>
                    <Badge tone="red">{ISSUE_LABELS[i.issue]}</Badge>
                  </Td>
                  <Td>{hm(i.current_worked_minutes)}</Td>
                  <Td>{hq && decision({ request_id: i.request_id } as CreditRequestRow, "revoke", "付与を取消", "取消理由")}</Td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-xs text-slate-500">勤怠が修正されても付与は自動では変わりません。本部が内容を確認して取り消すか、そのままにします。</p>
          </Card>
        )}

        <Card title={`付与候補（${candidates.length}件）`}>
          {candidates.length === 0 ? (
            <EmptyState>候補はありません。祝日の勤怠を院長確認すると、付与対象スタッフの候補が表示されます</EmptyState>
          ) : (
            <Table head={["スタッフ", "祝日", "実労働", "付与日数", "報告（当日休めなかった理由）", ""]}>
              {candidates.map((r) => (
                <tr key={r.request_id} className="align-top">
                  <Td>{name(r.staff_id)}</Td>
                  <Td>{r.source_work_date}</Td>
                  <Td>{hm(r.source_worked_minutes)}</Td>
                  <Td>{Number(r.credited_days)}日</Td>
                  <Td>{decision(r, "submit", "本部に報告", "例：予約が多く当日休めなかった")}</Td>
                  <Td>{decision(r, "reject", "付与しない", "理由（後日休んだ等）")}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title={`本部の承認待ち（${pending.length}件）`}>
          {pending.length === 0 ? (
            <EmptyState>承認待ちはありません</EmptyState>
          ) : (
            <Table head={["スタッフ", "祝日", "実労働", "付与日数", "院長の報告", ""]}>
              {pending.map((r) => (
                <tr key={r.request_id} className="align-top">
                  <Td>{name(r.staff_id)}</Td>
                  <Td>{r.source_work_date}</Td>
                  <Td>{hm(r.source_worked_minutes)}</Td>
                  <Td>{Number(r.credited_days)}日</Td>
                  <Td className="whitespace-normal">{r.report_reason}</Td>
                  <Td>
                    {hq ? (
                      <div className="flex flex-col gap-2">
                        {decision(r, "approve", `承認（${Number(r.credited_days)}日付与）`)}
                        {decision(r, "reject", "却下", "却下理由")}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">本部の承認待ち</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="振休の残り（付与ごと）">
          {active.length === 0 ? (
            <EmptyState>使用できる振休はありません</EmptyState>
          ) : (
            <Table head={["スタッフ", "祝日", "残り", "期限", hq ? "期限の変更（本部）" : ""]}>
              {active.map((g) => (
                <tr key={g.holiday_credit_id} className="align-top">
                  <Td>{name(g.staff_id)}</Td>
                  <Td>{g.source_work_date}</Td>
                  <Td>{g.remaining}日</Td>
                  <Td>
                    {g.expiration_date ?? "なし"}
                    {g.expiration_date && g.expiration_date <= addDays(today, 7) && <Badge tone="yellow">まもなく期限</Badge>}
                  </Td>
                  <Td>
                    {hq && (
                      <ActionForm action={changeExpiration} submitLabel="変更" tone="secondary" className="flex gap-2">
                        <input type="hidden" name="holiday_credit_id" value={g.holiday_credit_id} />
                        <input type="hidden" name="clinic_id" value={clinicId} />
                        <Input name="expiration_date" type="date" defaultValue={g.expiration_date ?? ""} className="w-36" required />
                        <Input name="reason" placeholder="理由" className="w-32" required />
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-2 text-xs text-slate-500">振休の取得は「休暇申請」から（種類：振休）。</p>
        </Card>

        {expiring.length > 0 && (
          <Card title={`期限切れ（失効候補 ${expiring.length}件）`}>
            {hq ? (
              <ActionForm action={expireCredits} submitLabel="選択した振休を失効させる" tone="danger" confirmMessage="選択した振休を失効として記録します。よろしいですか？">
                <Table head={["", "スタッフ", "祝日", "残り", "期限"]}>
                  {expiring.map((g) => (
                    <tr key={g.holiday_credit_id}>
                      <Td>
                        <input type="checkbox" name="holiday_credit_id" value={g.holiday_credit_id} defaultChecked aria-label="失効させる" />
                      </Td>
                      <Td>{name(g.staff_id)}</Td>
                      <Td>{g.source_work_date}</Td>
                      <Td>{g.remaining}日</Td>
                      <Td>{g.expiration_date}</Td>
                    </tr>
                  ))}
                </Table>
              </ActionForm>
            ) : (
              <p className="text-sm text-slate-600">期限切れの振休があります。失効させるか期限を延ばすかは本部が判断します。</p>
            )}
          </Card>
        )}

        <Card title="処理済み（直近）">
          {history.length === 0 ? (
            <EmptyState>処理済みはありません</EmptyState>
          ) : (
            <Table head={["スタッフ", "祝日", "状態", "理由・報告"]}>
              {history.map((r) => (
                <tr key={r.request_id}>
                  <Td>{name(r.staff_id)}</Td>
                  <Td>{r.source_work_date}</Td>
                  <Td>
                    <Badge tone={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "gray"}>
                      {r.status === "approved" ? "付与済み" : r.status === "rejected" ? "付与しない" : "取消"}
                    </Badge>
                  </Td>
                  <Td className="whitespace-normal text-slate-600">{r.reject_reason ?? r.cancel_reason ?? r.report_reason ?? ""}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
