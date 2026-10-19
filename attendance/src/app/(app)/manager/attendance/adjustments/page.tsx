import { requireManager } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Input, PageHeader, Table, Td } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import { PUNCH_TYPE_LABELS } from "@/lib/attendance/labels";
import { staffName, type StaffRow } from "@/lib/data/types";
import { formatJstDateTime } from "@/lib/time/jst";
import { AttendanceToolbar } from "../AttendanceToolbar";
import { decideAdjustment } from "../actions";

interface RequestRow {
  request_id: string;
  staff_id: string;
  work_date: string;
  change_type: "add" | "void" | "replace";
  before: { punch_type: string; punched_at: string } | null;
  after: { punch_type: string; punched_at: string } | null;
  reason: string;
  status: "manager_approved" | "approved" | "rejected" | "cancelled";
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
}

const CHANGE_LABELS = { add: "追加", void: "取り消し", replace: "時刻訂正" } as const;
const STATUS = {
  manager_approved: ["本部承認待ち", "yellow"],
  approved: ["承認済み", "green"],
  rejected: ["却下", "red"],
  cancelled: ["取り下げ", "gray"],
} as const;

const describe = (p: { punch_type: string; punched_at: string } | null) =>
  p ? `${PUNCH_TYPE_LABELS[p.punch_type] ?? p.punch_type} ${formatJstDateTime(p.punched_at)}` : "—";

/** 打刻修正の申請一覧。院長が申請（一次承認）→ 本部が最終承認すると打刻原本に追記される */
export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? clinics[0]?.clinic_id;
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const hq = isHq(actor);

  const { data } = await supabase
    .from("attendance_adjustment_requests")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("requested_at", { ascending: false })
    .limit(200);
  const requests = (data ?? []) as RequestRow[];
  const staffIds = [...new Set(requests.map((r) => r.staff_id))];
  const { data: staffData } = staffIds.length
    ? await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", staffIds)
    : { data: [] };
  const staffById = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_id, s]));
  const pending = requests.filter((r) => r.status === "manager_approved");
  const done = requests.filter((r) => r.status !== "manager_approved");

  const rowsOf = (list: RequestRow[], actions: boolean) =>
    list.map((r) => {
      const s = staffById.get(r.staff_id);
      return (
        <tr key={r.request_id} className="align-top">
          <Td>{r.work_date}</Td>
          <Td>{s ? staffName(s) : "—"}</Td>
          <Td>{CHANGE_LABELS[r.change_type]}</Td>
          <Td className="text-slate-600">{describe(r.before)}</Td>
          <Td>{r.change_type === "void" ? "取り消し" : describe(r.after)}</Td>
          <Td className="whitespace-normal">{r.reason}</Td>
          <Td>
            <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
            {r.reject_reason && <div className="mt-1 text-xs text-slate-500">{r.reject_reason}</div>}
          </Td>
          <Td>
            {actions && (
              <div className="flex flex-col gap-2">
                {hq && (
                  <ActionForm action={decideAdjustment} submitLabel="承認" className="flex gap-2">
                    <input type="hidden" name="request_id" value={r.request_id} />
                    <input type="hidden" name="decision" value="approve" />
                  </ActionForm>
                )}
                <ActionForm action={decideAdjustment} submitLabel={hq ? "却下" : "取り下げ"} tone="secondary" className="flex gap-2">
                  <input type="hidden" name="request_id" value={r.request_id} />
                  <input type="hidden" name="decision" value="reject" />
                  <Input name="comment" placeholder="理由" className="w-32" required />
                </ActionForm>
              </div>
            )}
          </Td>
        </tr>
      );
    });

  const head = ["勤務日", "スタッフ", "種類", "修正前", "修正後", "理由", "状態", ""];
  return (
    <>
      <PageHeader
        title="打刻修正"
        description="打刻原本は書き換えず、承認時に「取消レコード」と「新しい打刻」を追記します。修正前後と承認者は履歴に残ります。"
      />
      <AttendanceToolbar current="/manager/attendance/adjustments" clinics={clinics} clinicId={clinicId} />
      <Card title={`本部承認待ち（${pending.length}件）`} className="mb-6">
        {pending.length === 0 ? <EmptyState>承認待ちの申請はありません</EmptyState> : <Table head={head}>{rowsOf(pending, true)}</Table>}
        {!hq && <p className="mt-2 text-xs text-slate-500">新しい申請は「日次確認」の各スタッフの「修正を申請」から行います。</p>}
      </Card>
      <Card title="処理済み（直近）">
        {done.length === 0 ? <EmptyState>処理済みの申請はありません</EmptyState> : <Table head={head}>{rowsOf(done, false)}</Table>}
      </Card>
    </>
  );
}
