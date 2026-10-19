import Link from "next/link";
import { requireManager } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import { isActiveOn, staffName, type AssignmentRow, type StaffRow } from "@/lib/data/types";
import { formatJstDateTime, todayJst } from "@/lib/time/jst";
import { LEAVE_TYPE_LABELS, LEAVE_UNIT_LABELS } from "@/lib/validation/schemas";
import { decideLeave, proxyRequestLeave } from "./actions";

interface LeaveRequestRow {
  leave_request_id: string;
  staff_id: string;
  leave_type: keyof typeof LEAVE_TYPE_LABELS;
  start_date: string;
  end_date: string;
  unit: keyof typeof LEAVE_UNIT_LABELS;
  days_requested: string;
  note: string | null;
  status: "pending" | "manager_approved" | "approved" | "rejected" | "cancelled";
  requested_via: "kiosk" | "web" | "proxy";
  created_at: string;
  reject_reason: string | null;
  cancel_reason: string | null;
}

const STATUS = {
  pending: ["院長承認待ち", "yellow"],
  manager_approved: ["本部承認待ち", "blue"],
  approved: ["承認済み", "green"],
  rejected: ["却下", "red"],
  cancelled: ["取消", "gray"],
} as const;
const VIA = { kiosk: "端末", web: "本人", proxy: "代理" } as const;

/**
 * 休暇申請（有給・振休・その他）。スタッフ申請 → 院長一次承認 → 本部最終承認 → 台帳・シフトに反映。
 * 申請中の日数は予約として残数から差し引かれ、二重に使えない。
 */
export default async function LeaveRequestsPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? clinics[0]?.clinic_id;
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const hq = isHq(actor);
  const today = todayJst();

  const [{ data: requestData }, { data: assignmentData }] = await Promise.all([
    supabase.from("leave_requests").select("*").eq("home_clinic_id", clinicId).order("start_date", { ascending: false }).limit(300),
    supabase.from("staff_clinic_assignments").select("*").eq("clinic_id", clinicId).eq("assignment_type", "primary"),
  ]);
  const requests = (requestData ?? []) as LeaveRequestRow[];
  const primaryStaffIds = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => isActiveOn(a, today)).map((a) => a.staff_id);
  const staffIds = [...new Set([...requests.map((r) => r.staff_id), ...primaryStaffIds])];
  const { data: staffData } = staffIds.length
    ? await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", staffIds)
    : { data: [] };
  const staffById = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_id, s]));

  const balances = await Promise.all(
    primaryStaffIds.map(async (id) => {
      const { data } = await supabase.rpc("leave_balances", { p_staff_id: id });
      const rows = (data ?? []) as { leave_type: string; available: string }[];
      return [id, Object.fromEntries(rows.map((r) => [r.leave_type, Number(r.available)]))] as const;
    }),
  );
  const balanceOf = new Map(balances);

  const waitingManager = requests.filter((r) => r.status === "pending");
  const waitingHq = requests.filter((r) => r.status === "manager_approved");
  const approved = requests.filter((r) => r.status === "approved" && r.end_date >= today);
  const history = requests.filter((r) => !["pending", "manager_approved"].includes(r.status)).slice(0, 50);

  const row = (r: LeaveRequestRow, actions: React.ReactNode) => {
    const s = staffById.get(r.staff_id);
    return (
      <tr key={r.leave_request_id} className="align-top">
        <Td>{s ? staffName(s) : "—"}</Td>
        <Td>{LEAVE_TYPE_LABELS[r.leave_type]}</Td>
        <Td>
          {r.start_date}
          {r.end_date !== r.start_date && ` 〜 ${r.end_date}`}
        </Td>
        <Td>
          {LEAVE_UNIT_LABELS[r.unit]}（{Number(r.days_requested)}日）
        </Td>
        <Td className="whitespace-normal text-slate-600">{r.note ?? ""}</Td>
        <Td>
          <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
          <div className="mt-1 text-xs text-slate-500">
            {VIA[r.requested_via]}・{formatJstDateTime(r.created_at)}
          </div>
          {(r.reject_reason || r.cancel_reason) && <div className="text-xs text-slate-500">{r.reject_reason ?? r.cancel_reason}</div>}
        </Td>
        <Td>{actions}</Td>
      </tr>
    );
  };
  const decide = (r: LeaveRequestRow, decision: "manager_approve" | "final_approve" | "reject" | "cancel", label: string, needsReason = false) => (
    <ActionForm
      action={decideLeave}
      submitLabel={label}
      tone={decision === "reject" || decision === "cancel" ? "secondary" : "primary"}
      className="flex gap-2"
      confirmMessage={decision === "cancel" && r.status === "approved" ? "承認済みの休暇を取り消し、残数を戻します。よろしいですか？" : undefined}
    >
      <input type="hidden" name="leave_request_id" value={r.leave_request_id} />
      <input type="hidden" name="decision" value={decision} />
      {needsReason && <Input name="comment" placeholder="理由" className="w-28" required />}
    </ActionForm>
  );
  const head = ["スタッフ", "種類", "日付", "単位", "備考", "状態", ""];

  return (
    <>
      <PageHeader title="休暇申請" description="スタッフは各院の共用端末から申請できます。端末を使えない場合は下の「代理申請」から院長が申請します。" />
      <form method="get" className="mb-6 flex items-center gap-2">
        <select name="clinic" defaultValue={clinicId} aria-label="院" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          {clinics.map((c) => (
            <option key={c.clinic_id} value={c.clinic_id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
          切替
        </button>
        <Link href={`/manager/holiday-credits?clinic=${clinicId}`} className="ml-4 text-sm text-brand-700 underline">
          振休（祝日勤務）の報告へ
        </Link>
      </form>

      <div className="space-y-6">
        <Card title={`院長の一次承認待ち（${waitingManager.length}件）`}>
          {waitingManager.length === 0 ? (
            <EmptyState>承認待ちはありません</EmptyState>
          ) : (
            <Table head={head}>
              {waitingManager.map((r) =>
                row(
                  r,
                  <div className="flex flex-col gap-2">
                    {decide(r, "manager_approve", "一次承認")}
                    {decide(r, "reject", "却下", true)}
                  </div>,
                ),
              )}
            </Table>
          )}
        </Card>

        <Card title={`本部の最終承認待ち（${waitingHq.length}件）`}>
          {waitingHq.length === 0 ? (
            <EmptyState>最終承認待ちはありません</EmptyState>
          ) : (
            <Table head={head}>
              {waitingHq.map((r) =>
                row(
                  r,
                  <div className="flex flex-col gap-2">
                    {hq && decide(r, "final_approve", "最終承認")}
                    {decide(r, "reject", "却下", true)}
                  </div>,
                ),
              )}
            </Table>
          )}
        </Card>

        <Card title="承認済み（今後の休暇）">
          {approved.length === 0 ? (
            <EmptyState>予定されている休暇はありません</EmptyState>
          ) : (
            <Table head={head}>{approved.map((r) => row(r, hq ? decide(r, "cancel", "取消", true) : null))}</Table>
          )}
          {!hq && <p className="mt-2 text-xs text-slate-500">承認済みの休暇の取消は本部に依頼してください（残数を戻す処理が必要なため）。</p>}
        </Card>

        <Card title="代理申請">
          <ActionForm action={proxyRequestLeave} submitLabel="申請" className="grid gap-4 sm:grid-cols-6">
            <input type="hidden" name="clinic_id" value={clinicId} />
            <Field label="スタッフ">
              <Select name="staff_id" required defaultValue="">
                <option value="" disabled>
                  選択
                </option>
                {primaryStaffIds.map((id) => {
                  const s = staffById.get(id);
                  const b = balanceOf.get(id) ?? {};
                  return s ? (
                    <option key={id} value={id}>
                      {staffName(s)}（有給 {b.paid ?? 0}日・振休 {b.holiday_credit ?? 0}日）
                    </option>
                  ) : null;
                })}
              </Select>
            </Field>
            <Field label="種類">
              <Select name="leave_type" defaultValue="paid">
                {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="開始日">
              <Input name="start_date" type="date" min={today} required />
            </Field>
            <Field label="終了日" hint="1日だけなら空欄">
              <Input name="end_date" type="date" min={today} />
            </Field>
            <Field label="単位">
              <Select name="unit" defaultValue="full">
                <option value="full">全日</option>
                <option value="am">午前半休</option>
                <option value="pm">午後半休</option>
              </Select>
            </Field>
            <Field label="備考">
              <Input name="note" />
            </Field>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">括弧内は使用可能な残数（申請中の分を差し引き済み）。期間指定は休みの日も1日として数えます。</p>
        </Card>

        <Card title="処理済み（直近）">
          {history.length === 0 ? <EmptyState>処理済みの申請はありません</EmptyState> : <Table head={head}>{history.map((r) => row(r, null))}</Table>}
        </Card>
      </div>
    </>
  );
}
