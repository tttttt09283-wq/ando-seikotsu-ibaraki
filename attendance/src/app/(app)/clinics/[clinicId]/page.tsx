import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireClinicManager } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { DAY_KINDS, DAY_KIND_LABELS, SLOTS_PER_DAY, formatSlots, hhmm, slotFieldName, type TimeSlot } from "@/lib/calendar";
import { isActiveOn, type ClinicRow } from "@/lib/data/types";
import { addDays, todayJst } from "@/lib/time/jst";
import { deleteCalendarException, saveBusinessHours, saveCalendarException } from "./actions";

interface HoursRow {
  day_of_week: number;
  slot_no: number;
  open_time: string;
  close_time: string;
  valid_from: string;
  valid_to: string | null;
}

interface ExceptionRow {
  id: string;
  target_date: string;
  is_closed: boolean;
  slots: TimeSlot[];
  reason: string;
}

const PREVIEW_DAYS = 14;
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "UTC" });

/**
 * 院カレンダー：通常の診療時間（本部が管理）と、臨時休診・特別診療（本部・担当院長が調整）。
 * 院ごとに診療時間・休日が異なるため、シフト作成（フェーズ2）はこのカレンダーを基準に警告を出す。
 */
export default async function ClinicCalendarPage({ params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;
  if (!z.uuid().safeParse(clinicId).success) notFound();
  const actor = await requireClinicManager(clinicId);
  const hq = isHq(actor);
  const today = todayJst();

  const supabase = await createSupabaseServer();
  const [{ data: clinic }, { data: hoursData }, { data: exceptionData }, { data: holidayData }] = await Promise.all([
    supabase.from("clinics").select("*").eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("clinic_business_hours").select("*").eq("clinic_id", clinicId).order("valid_from", { ascending: false }),
    supabase
      .from("clinic_calendar_exceptions")
      .select("id, target_date, is_closed, slots, reason")
      .eq("clinic_id", clinicId)
      .gte("target_date", addDays(today, -31))
      .order("target_date"),
    supabase
      .from("company_holidays")
      .select("holiday_date, name")
      .gte("holiday_date", today)
      .lte("holiday_date", addDays(today, PREVIEW_DAYS)),
  ]);
  if (!clinic) notFound();
  const c = clinic as ClinicRow;
  const hours = (hoursData ?? []) as HoursRow[];
  const exceptions = (exceptionData ?? []) as ExceptionRow[];
  const holidayName = new Map(((holidayData ?? []) as { holiday_date: string; name: string }[]).map((h) => [h.holiday_date, h.name]));

  const currentHours = hours.filter((h) => isActiveOn(h, today));
  const futureFrom = hours.find((h) => h.valid_from > today)?.valid_from;
  const slotsFor = (day: number, rows: HoursRow[]) =>
    rows
      .filter((h) => h.day_of_week === day)
      .sort((a, b) => a.slot_no - b.slot_no)
      .map((h) => ({ open: h.open_time, close: h.close_time }));

  const preview = await Promise.all(
    Array.from({ length: PREVIEW_DAYS }, async (_, i) => {
      const date = addDays(today, i);
      const { data } = await supabase.rpc("clinic_hours_on", { p_clinic_id: clinicId, p_date: date });
      const rows = (data ?? []) as { open_time: string; close_time: string; source: string }[];
      return {
        date,
        slots: rows.map((r) => ({ open: r.open_time, close: r.close_time })),
        isException: exceptions.some((e) => e.target_date === date),
      };
    }),
  );

  return (
    <>
      <PageHeader
        title={`${c.name} 診療時間・休診日`}
        description="院ごとに診療時間と休日が異なります。臨時休診・特別診療日は院長が調整できます。"
        actions={
          <Link href={hq ? "/admin/clinics" : "/manager"} className="text-sm text-brand-700 underline">
            戻る
          </Link>
        }
      />

      <div className="space-y-6">
        <Card title={`今後${PREVIEW_DAYS}日間の診療予定`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {preview.map((d) => {
              const weekday = WEEKDAY_FORMAT.format(new Date(`${d.date}T00:00:00Z`));
              const holiday = holidayName.get(d.date);
              return (
                <div
                  key={d.date}
                  className={`rounded-md border p-2 text-xs ${d.slots.length === 0 ? "border-slate-200 bg-slate-50 text-slate-500" : "border-brand-200 bg-white"}`}
                >
                  <div className="font-medium text-navy-900">
                    {d.date.slice(5).replace("-", "/")}（{weekday}）
                  </div>
                  {holiday && <div className="text-rose-600">{holiday}</div>}
                  <div className="mt-1">{formatSlots(d.slots)}</div>
                  {d.isException && (
                    <div className="mt-1">
                      <Badge tone="yellow">臨時</Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="臨時休診・特別診療日">
          {exceptions.length === 0 ? (
            <EmptyState>登録はありません</EmptyState>
          ) : (
            <Table head={["日付", "区分", "診療時間", "理由", ""]}>
              {exceptions.map((e) => (
                <tr key={e.id} className={e.target_date < today ? "text-slate-400" : ""}>
                  <Td>{e.target_date}</Td>
                  <Td>{e.is_closed ? <Badge tone="red">臨時休診</Badge> : <Badge tone="blue">特別診療</Badge>}</Td>
                  <Td>{e.is_closed ? "—" : formatSlots(e.slots)}</Td>
                  <Td>{e.reason}</Td>
                  <Td>
                    {e.target_date >= today && (
                      <ActionForm
                        action={deleteCalendarException}
                        submitLabel="取り消し"
                        tone="secondary"
                        confirmMessage={`${e.target_date} の登録を取り消して通常の診療時間に戻します。よろしいですか？`}
                      >
                        <input type="hidden" name="clinic_id" value={clinicId} />
                        <input type="hidden" name="exception_id" value={e.id} />
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}

          <h3 className="mb-3 mt-6 text-sm font-bold">登録・変更（同じ日付は上書き）</h3>
          <ActionForm action={saveCalendarException} submitLabel="登録" className="grid gap-4 sm:grid-cols-6">
            <input type="hidden" name="clinic_id" value={clinicId} />
            <Field label="日付">
              <Input name="target_date" type="date" min={today} required />
            </Field>
            <Field label="区分">
              <Select name="is_closed" defaultValue="true">
                <option value="true">臨時休診</option>
                <option value="false">特別診療</option>
              </Select>
            </Field>
            <Field label="特別診療 枠1" hint="特別診療のみ">
              <div className="flex gap-1">
                <Input name="open1" type="time" aria-label="枠1 開始" />
                <Input name="close1" type="time" aria-label="枠1 終了" />
              </div>
            </Field>
            <Field label="特別診療 枠2" hint="任意">
              <div className="flex gap-1">
                <Input name="open2" type="time" aria-label="枠2 開始" />
                <Input name="close2" type="time" aria-label="枠2 終了" />
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Field label="理由">
                <Input name="reason" placeholder="例：設備点検、地域行事" required />
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="通常の診療時間">
          <Table head={["曜日", "現在の診療時間"]}>
            {DAY_KINDS.map((day) => (
              <tr key={day}>
                <Td className="font-medium">{day === 7 ? "祝日" : `${DAY_KIND_LABELS[day]}曜`}</Td>
                <Td>{formatSlots(slotsFor(day, currentHours))}</Td>
              </tr>
            ))}
          </Table>
          {currentHours.length === 0 && (
            <p className="mt-2 text-sm text-amber-700">診療時間が未登録です（全曜日が休診として扱われます）。</p>
          )}
          {futureFrom && <p className="mt-2 text-sm text-slate-600">{futureFrom} から新しい診療時間が適用されます。</p>}

          {hq ? (
            <>
              <h3 className="mb-3 mt-6 text-sm font-bold">診療時間を変更（本部のみ）</h3>
              <p className="mb-3 text-xs text-slate-500">
                全曜日分を入力してください。空欄の曜日は定休日になります。変更前の日付の勤怠・シフトは旧時間のまま扱われます。
              </p>
              <ActionForm
                action={saveBusinessHours}
                submitLabel="この内容で登録"
                resetOnSuccess={false}
                confirmMessage="診療時間を登録します。よろしいですか？"
              >
                <input type="hidden" name="clinic_id" value={clinicId} />
                <Field label="適用開始日">
                  <Input name="valid_from" type="date" defaultValue={addDays(today, 1)} className="w-44" required />
                </Field>
                <div className="overflow-x-auto">
                  <table className="text-sm">
                    <tbody>
                      {DAY_KINDS.map((day) => {
                        const existing = slotsFor(day, currentHours);
                        return (
                          <tr key={day}>
                            <td className="w-14 py-1 pr-3 font-medium">{day === 7 ? "祝日" : `${DAY_KIND_LABELS[day]}曜`}</td>
                            {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
                              <td key={i} className="py-1 pr-4">
                                <div className="flex items-center gap-1">
                                  <Input
                                    name={slotFieldName(day, i + 1, "open")}
                                    type="time"
                                    defaultValue={existing[i] ? hhmm(existing[i].open) : ""}
                                    aria-label={`${DAY_KIND_LABELS[day]} 枠${i + 1} 開始`}
                                    className="w-28"
                                  />
                                  〜
                                  <Input
                                    name={slotFieldName(day, i + 1, "close")}
                                    type="time"
                                    defaultValue={existing[i] ? hhmm(existing[i].close) : ""}
                                    aria-label={`${DAY_KIND_LABELS[day]} 枠${i + 1} 終了`}
                                    className="w-28"
                                  />
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ActionForm>
            </>
          ) : (
            <p className="mt-4 text-xs text-slate-500">通常の診療時間の変更は本部事務に依頼してください。</p>
          )}
        </Card>
      </div>
    </>
  );
}
