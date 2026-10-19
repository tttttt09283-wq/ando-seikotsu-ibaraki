import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Input, PageHeader, Table, Td } from "@/components/ui";
import { CLOSING_STATUS_LABELS } from "@/lib/attendance/labels";
import type { ClinicRow } from "@/lib/data/types";
import { addMonths, formatJstDateTime, isValidMonth, todayJst } from "@/lib/time/jst";
import { closeAll, reopenMonth } from "./actions";

interface ClosingRow {
  clinic_id: string;
  status: string;
  manager_confirmed_at: string | null;
  closed_at: string | null;
  reopen_count: number;
}

interface EventRow {
  id: number;
  clinic_id: string;
  action: string;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
}

interface Issues {
  missing_punch: number;
  needs_recalc: number;
  unconfirmed: number;
  pending_adjustments: number;
  pending_leave: number;
}

const EVENT_LABELS: Record<string, string> = {
  manager_confirm: "院長確認",
  manager_unconfirm: "院長確認の取消",
  close: "締め",
  reopen: "再開",
  reclose: "再締め",
};

/**
 * 月次締め（本部）：院長確認済みの院を締める（院別・全院一括）。締め済みの月は誰も勤怠・シフトを変更できない。
 * 修正が必要な場合は理由を入力して再開し、修正後に再締めする。履歴はすべて残る。
 */
export default async function HqClosingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireHq();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const currentMonth = todayJst().slice(0, 7);
  const month = params.month && isValidMonth(params.month) ? params.month : addMonths(currentMonth, -1);
  const ym = `${month}-01`;
  const ended = month < currentMonth;

  const [{ data: clinicData }, { data: closingData }, { data: eventData }, { data: accountData }] = await Promise.all([
    supabase.from("clinics").select("*").order("display_order"),
    supabase.from("monthly_closings").select("*").eq("year_month", ym),
    supabase.from("monthly_closing_events").select("id, clinic_id, action, reason, actor_id, created_at").eq("year_month", ym).order("id", { ascending: false }),
    supabase.from("app_accounts").select("user_id, display_name"),
  ]);
  const clinics = ((clinicData ?? []) as ClinicRow[]).filter((c) => c.status !== "closed" || (closingData ?? []).some((x) => x.clinic_id === c.clinic_id));
  const closings = new Map(((closingData ?? []) as ClosingRow[]).map((c) => [c.clinic_id, c]));
  const events = (eventData ?? []) as EventRow[];
  const actorName = new Map(((accountData ?? []) as { user_id: string; display_name: string }[]).map((a) => [a.user_id, a.display_name]));
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const issues = new Map(
    await Promise.all(
      clinics.map(async (c) => {
        const { data } = await supabase.rpc("closing_issues", { p_clinic_id: c.clinic_id, p_month: ym });
        return [c.clinic_id, (data ?? {}) as Issues] as const;
      }),
    ),
  );
  const closable = (status: string) => status === "manager_confirmed" || status === "reopened";
  const closed = clinics.filter((c) => closings.get(c.clinic_id)?.status === "closed");

  return (
    <>
      <PageHeader
        title={`月次締め：${month.replace("-", "年")}月`}
        description="院長確認済みの院を締めます。締めた月の勤怠・シフト・打刻修正・休暇は、本部が再開するまで誰も変更できません。"
        actions={
          <span className="flex gap-3 text-sm text-brand-700">
            <Link className="underline" href={`?month=${addMonths(month, -1)}`}>
              前月
            </Link>
            {addMonths(month, 1) < currentMonth && (
              <Link className="underline" href={`?month=${addMonths(month, 1)}`}>
                翌月
              </Link>
            )}
            <Link className="underline" href={`/exports?month=${month}`}>
              帳票を出力
            </Link>
          </span>
        }
      />
      {!ended && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">この月はまだ終わっていないため、院長確認・締めはできません。</p>}

      <div className="space-y-6">
        <Card title="締めの状況">
          <ActionForm
            action={closeAll}
            submitLabel="選択した院を締める"
            resetOnSuccess={false}
            confirmMessage={`${month} の選択した院を締めます。締めた後は再開するまで変更できません。よろしいですか？`}
          >
            <input type="hidden" name="month" value={month} />
            <Table head={["", "院", "状態", "院長確認", "締め", "再開回数", "打刻漏れ", "再計算待ち", "未確認", "打刻修正待ち", "休暇の承認待ち"]}>
              {clinics.map((c) => {
                const st = closings.get(c.clinic_id);
                const status = st?.status ?? "open";
                const i = issues.get(c.clinic_id);
                const blocking = (i?.needs_recalc ?? 0) + (i?.pending_adjustments ?? 0) + (i?.pending_leave ?? 0) > 0;
                const label = CLOSING_STATUS_LABELS[status];
                return (
                  <tr key={c.clinic_id}>
                    <Td>
                      <input
                        type="checkbox"
                        name="clinic_ids"
                        value={c.clinic_id}
                        aria-label={`${c.name}を締める`}
                        defaultChecked={ended && closable(status) && !blocking}
                        disabled={!ended || !closable(status)}
                      />
                    </Td>
                    <Td className="font-medium">
                      <Link href={`/manager/attendance/monthly?clinic=${c.clinic_id}&month=${month}`} className="text-brand-700 underline">
                        {c.name}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={label.tone}>{label.label}</Badge>
                    </Td>
                    <Td>{st?.manager_confirmed_at ? formatJstDateTime(st.manager_confirmed_at) : "—"}</Td>
                    <Td>{st?.closed_at && status === "closed" ? formatJstDateTime(st.closed_at) : "—"}</Td>
                    <Td>{st?.reopen_count ?? 0}</Td>
                    <Td className={i?.missing_punch ? "text-amber-700" : ""}>{i?.missing_punch ?? 0}</Td>
                    <Td className={i?.needs_recalc ? "font-bold text-rose-700" : ""}>{i?.needs_recalc ?? 0}</Td>
                    <Td className={i?.unconfirmed ? "text-amber-700" : ""}>{i?.unconfirmed ?? 0}</Td>
                    <Td className={i?.pending_adjustments ? "font-bold text-rose-700" : ""}>{i?.pending_adjustments ?? 0}</Td>
                    <Td className={i?.pending_leave ? "font-bold text-rose-700" : ""}>{i?.pending_leave ?? 0}</Td>
                  </tr>
                );
              })}
            </Table>
            <p className="text-xs text-slate-500">
              締められるのは「院長確認済み」「再開中」の院です。再計算待ち・打刻修正の承認待ち・休暇の承認待ちが残っている院は締められません（赤字）。打刻漏れ・未確認は院長が理由を付けて確認済みにしたものです。
            </p>
          </ActionForm>
        </Card>

        <Card title="締めの再開（理由必須）">
          {closed.length === 0 ? (
            <EmptyState>締め済みの院はありません</EmptyState>
          ) : (
            <div className="space-y-3">
              {closed.map((c) => (
                <ActionForm
                  key={c.clinic_id}
                  action={reopenMonth}
                  submitLabel={`${c.name}を再開`}
                  tone="danger"
                  className="flex flex-wrap items-center gap-3"
                  confirmMessage={`${c.name} の ${month} の締めを再開します。修正後にもう一度締めてください。よろしいですか？`}
                >
                  <input type="hidden" name="clinic_id" value={c.clinic_id} />
                  <input type="hidden" name="month" value={month} />
                  <span className="w-24 font-medium">{c.name}</span>
                  <Input name="reason" required maxLength={500} placeholder="再開の理由（例：9/8 の退勤打刻の修正のため）" className="w-96" aria-label={`${c.name}の再開理由`} />
                </ActionForm>
              ))}
            </div>
          )}
        </Card>

        <Card title="履歴">
          {events.length === 0 ? (
            <EmptyState>この月の履歴はありません</EmptyState>
          ) : (
            <Table head={["日時", "院", "操作", "理由", "操作した人"]}>
              {events.map((e) => (
                <tr key={e.id}>
                  <Td>{formatJstDateTime(e.created_at)}</Td>
                  <Td>{clinicName.get(e.clinic_id) ?? "—"}</Td>
                  <Td>
                    <Badge tone={e.action === "reopen" ? "red" : e.action.includes("close") ? "green" : "gray"}>{EVENT_LABELS[e.action] ?? e.action}</Badge>
                  </Td>
                  <Td className="whitespace-normal">{e.reason ?? ""}</Td>
                  <Td>{e.actor_id ? actorName.get(e.actor_id) ?? "—" : "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
