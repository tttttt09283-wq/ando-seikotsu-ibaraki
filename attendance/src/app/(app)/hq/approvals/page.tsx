import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { hm, PUNCH_TYPE_LABELS } from "@/lib/attendance/labels";
import { staffName, type ClinicRow, type StaffRow } from "@/lib/data/types";
import { LEAVE_TYPE_LABELS, LEAVE_UNIT_LABELS } from "@/lib/validation/schemas";
import { formatJstDateTime } from "@/lib/time/jst";
import { BulkApproveForm } from "./BulkApproveForm";

interface AdjustmentRow {
  request_id: string;
  staff_id: string;
  clinic_id: string;
  work_date: string;
  change_type: "add" | "void" | "replace";
  punch_type: string | null;
  requested_time: string | null;
  reason: string;
  requested_at: string;
}

interface LeaveRow {
  leave_request_id: string;
  staff_id: string;
  home_clinic_id: string | null;
  leave_type: keyof typeof LEAVE_TYPE_LABELS;
  start_date: string;
  end_date: string;
  unit: keyof typeof LEAVE_UNIT_LABELS;
  minutes: number | null;
  days_requested: string;
  note: string | null;
  manager_approved_at: string | null;
}

interface CreditRow {
  request_id: string;
  staff_id: string;
  home_clinic_id: string | null;
  source_work_date: string;
  source_worked_minutes: number;
  credited_days: string | null;
  report_reason: string | null;
  submitted_at: string | null;
}

const CHANGE_LABELS = { add: "打刻を追加", void: "打刻を取消", replace: "時刻を訂正" } as const;
const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * 本部の一括承認：全院の本部承認待ち（打刻修正・休暇の最終承認・振休）をまとめて承認する。
 * 承認は1件ずつ既存の承認処理を通し、承認履歴も1件ずつ（同じ一括処理ID付きで）残る。
 */
export default async function HqApprovalsPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  await requireHq();
  const params = await searchParams;
  const supabase = await createSupabaseServer();

  const [{ data: clinicData }, { data: adjustmentData }, { data: leaveData }, { data: creditData }] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name").order("display_order"),
    supabase.from("attendance_adjustment_requests").select("*").eq("status", "manager_approved").order("work_date").limit(500),
    supabase.from("leave_requests").select("*").eq("status", "manager_approved").order("start_date").limit(500),
    supabase.from("holiday_credit_requests").select("*").eq("status", "pending").order("source_work_date").limit(500),
  ]);
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name">[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? null;
  const inClinic = (id: string | null) => !clinicId || id === clinicId;

  const adjustments = ((adjustmentData ?? []) as AdjustmentRow[]).filter((r) => inClinic(r.clinic_id));
  const leaves = ((leaveData ?? []) as LeaveRow[]).filter((r) => inClinic(r.home_clinic_id));
  const credits = ((creditData ?? []) as CreditRow[]).filter((r) => inClinic(r.home_clinic_id));

  const staffIds = [...new Set([...adjustments, ...leaves, ...credits].map((r) => r.staff_id))];
  const { data: staffData } = staffIds.length
    ? await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", staffIds)
    : { data: [] };
  const staffById = new Map(((staffData ?? []) as StaffRow[]).map((s) => [s.staff_id, s]));
  const who = (id: string) => {
    const s = staffById.get(id);
    return s ? (
      <>
        <div className="font-medium">{staffName(s)}</div>
        <div className="text-xs text-slate-500">{s.staff_code}</div>
      </>
    ) : (
      "—"
    );
  };
  const clinicLabel = (id: string | null) => (id ? clinicName.get(id) ?? "—" : "—");

  return (
    <>
      <PageHeader
        title="一括承認（本部）"
        description="全院の本部承認待ちを一覧し、チェックしたものをまとめて承認します。承認は1件ずつ通常の承認と同じチェック（締め済みの月・残数など）を行い、承認できなかったものは理由を表示します。"
        actions={
          <Link href="/hq" className="text-sm text-brand-700 underline">
            ダッシュボードへ戻る
          </Link>
        }
      />
      <form method="get" className="mb-6 flex items-center gap-2 text-sm">
        <select name="clinic" defaultValue={clinicId ?? ""} aria-label="院" className="rounded-md border border-slate-300 bg-white px-3 py-2">
          <option value="">全院</option>
          {clinics.map((c) => (
            <option key={c.clinic_id} value={c.clinic_id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
          絞り込む
        </button>
      </form>

      <div className="space-y-6">
        <Card title={`打刻修正（${adjustments.length}件）`}>
          {adjustments.length === 0 ? (
            <EmptyState>本部承認待ちの打刻修正はありません</EmptyState>
          ) : (
            <BulkApproveForm
              kind="attendance_adjustment"
              label="打刻修正"
              head={["院", "スタッフ", "勤務日", "内容", "理由", "申請日時"]}
              items={adjustments.map((r) => ({
                id: r.request_id,
                cells: [
                  clinicLabel(r.clinic_id),
                  who(r.staff_id),
                  r.work_date,
                  `${CHANGE_LABELS[r.change_type]}${r.punch_type ? `：${PUNCH_TYPE_LABELS[r.punch_type]}` : ""}${r.requested_time ? ` ${timeFmt.format(new Date(r.requested_time))}` : ""}`,
                  r.reason,
                  formatJstDateTime(r.requested_at),
                ],
              }))}
            />
          )}
        </Card>

        <Card title={`休暇の最終承認（${leaves.length}件）`}>
          {leaves.length === 0 ? (
            <EmptyState>院長承認済みで本部の最終承認待ちの休暇はありません</EmptyState>
          ) : (
            <BulkApproveForm
              kind="leave"
              label="休暇"
              head={["院", "スタッフ", "種類", "日付", "日数", "備考", "院長承認"]}
              items={leaves.map((r) => ({
                id: r.leave_request_id,
                cells: [
                  clinicLabel(r.home_clinic_id),
                  who(r.staff_id),
                  `${LEAVE_TYPE_LABELS[r.leave_type]}（${LEAVE_UNIT_LABELS[r.unit]}${r.minutes ? ` ${hm(r.minutes)}` : ""}）`,
                  r.start_date === r.end_date ? r.start_date : `${r.start_date}〜${r.end_date}`,
                  `${Number(r.days_requested)}日`,
                  r.note ?? "",
                  formatJstDateTime(r.manager_approved_at),
                ],
              }))}
            />
          )}
          <p className="mt-2 text-xs text-slate-500">院長の一次承認前の申請は、各院の「休暇申請」画面で一次承認されてからここに表示されます。</p>
        </Card>

        <Card title={`振休の承認（${credits.length}件）`}>
          {credits.length === 0 ? (
            <EmptyState>報告済みで本部承認待ちの振休はありません</EmptyState>
          ) : (
            <BulkApproveForm
              kind="holiday_credit"
              label="振休"
              head={["院", "スタッフ", "祝日勤務日", "実働", "付与日数", "当日使えなかった理由", "報告日時"]}
              items={credits.map((r) => ({
                id: r.request_id,
                cells: [
                  clinicLabel(r.home_clinic_id),
                  who(r.staff_id),
                  r.source_work_date,
                  hm(r.source_worked_minutes),
                  r.credited_days ? `${Number(r.credited_days)}日` : "—",
                  r.report_reason ?? "",
                  formatJstDateTime(r.submitted_at),
                ],
              }))}
            />
          )}
        </Card>
      </div>
    </>
  );
}
