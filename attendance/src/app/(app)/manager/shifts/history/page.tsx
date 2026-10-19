import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { resolveSelection, selectableClinics } from "@/lib/shifts/load";
import { SHIFT_TYPE_LABELS, type ShiftType } from "@/lib/shifts/model";
import { formatJstDateTime, monthDates } from "@/lib/time/jst";
import { ShiftToolbar } from "../ShiftToolbar";

interface HistoryRow {
  id: number;
  staff_name: string;
  work_date: string;
  action: "create" | "update" | "confirm" | "cancel";
  before: Snapshot | null;
  after: Snapshot;
  reason: string | null;
  requires_recalc: boolean;
  changed_by_name: string;
  changed_at: string;
}

interface Snapshot {
  shift_type: ShiftType;
  status: string;
  start: string | null;
  end: string | null;
  break_minutes: number;
}

const ACTION_LABELS = { create: "作成", update: "変更", confirm: "確定", cancel: "取消" } as const;
const ACTION_TONES = { create: "blue", update: "yellow", confirm: "green", cancel: "red" } as const;

function describe(s: Snapshot | null) {
  if (!s) return "—";
  if (s.shift_type !== "work") return SHIFT_TYPE_LABELS[s.shift_type];
  const end = s.end && s.start && s.end.slice(0, 10) > s.start.slice(0, 10) ? `翌${s.end.slice(11)}` : s.end?.slice(11);
  return `${s.start?.slice(11)}〜${end}（休憩${s.break_minutes}分）`;
}

/** シフトの変更履歴（作成・変更・確定・取消。確定後の変更は理由つき） */
export default async function ShiftHistoryPage({ searchParams }: { searchParams: Promise<{ clinic?: string; month?: string }> }) {
  const actor = await requireManager();
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const { clinicId, month } = resolveSelection(clinics, await searchParams);
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const dates = monthDates(month);
  const { data, error } = await supabase.rpc("shift_history", { p_clinic_id: clinicId, p_from: dates[0], p_to: dates[dates.length - 1] });
  const rows = (data ?? []) as HistoryRow[];
  const clinicName = clinics.find((c) => c.clinic_id === clinicId)?.name ?? "";

  return (
    <>
      <PageHeader title={`変更履歴：${clinicName}`} description="打刻・承認済みの勤怠・休暇台帳は、シフトを変更しても自動では書き換わりません。「再計算要」の変更は勤怠の確認が必要です。" />
      <ShiftToolbar current="/manager/shifts/history" clinics={clinics} clinicId={clinicId} month={month} closed={false} />
      <Card>
        {error ? (
          <EmptyState>履歴を取得できませんでした</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState>この月の変更履歴はありません</EmptyState>
        ) : (
          <Table head={["日時", "操作", "勤務日", "スタッフ", "変更前", "変更後", "理由", "", "操作者"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="text-slate-600">{formatJstDateTime(r.changed_at)}</Td>
                <Td>
                  <Badge tone={ACTION_TONES[r.action]}>{ACTION_LABELS[r.action]}</Badge>
                </Td>
                <Td>{r.work_date}</Td>
                <Td>{r.staff_name}</Td>
                <Td className="text-slate-600">{r.action === "create" ? "—" : describe(r.before)}</Td>
                <Td>{r.action === "cancel" ? "取消" : describe(r.after)}</Td>
                <Td className="whitespace-normal">{r.reason ?? ""}</Td>
                <Td>{r.requires_recalc && r.action !== "confirm" && <Badge tone="red">再計算要</Badge>}</Td>
                <Td className="text-slate-600">{r.changed_by_name}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
