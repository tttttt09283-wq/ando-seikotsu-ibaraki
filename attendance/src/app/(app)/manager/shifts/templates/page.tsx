import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { loadShiftMonth, resolveSelection, selectableClinics } from "@/lib/shifts/load";
import { formatMinutes, spanBetween } from "@/lib/shifts/model";
import { requiredBreakMinutes } from "@/lib/shifts/warnings";
import { hhmm } from "@/lib/calendar";
import { ShiftToolbar } from "../ShiftToolbar";
import { saveTemplate, toggleTemplate } from "../actions";

const COLORS = [
  ["sky", "青"],
  ["emerald", "緑"],
  ["amber", "黄"],
  ["rose", "赤"],
  ["violet", "紫"],
  ["slate", "灰"],
] as const;

/** 勤務パターン：院ごとのパターン（院長が管理）と全院共通パターン（本部が管理） */
export default async function ShiftTemplatesPage({ searchParams }: { searchParams: Promise<{ clinic?: string; month?: string }> }) {
  const actor = await requireManager();
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const { clinicId, month } = resolveSelection(clinics, await searchParams);
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const data = await loadShiftMonth(supabase, actor, clinicId, month);
  if (!data) return <EmptyState>院が見つかりません</EmptyState>;

  return (
    <>
      <PageHeader
        title={`勤務パターン：${data.clinic.name}`}
        description="よく使う勤務時間をパターンとして登録すると、シフト作成で選ぶだけで入力できます。終了が開始より前のパターンは翌日終了になります。"
      />
      <ShiftToolbar current="/manager/shifts/templates" clinics={clinics} clinicId={clinicId} month={month} closed={false} />

      <Card title="パターン一覧" className="mb-6">
        {data.templates.length === 0 ? (
          <EmptyState>パターンがありません</EmptyState>
        ) : (
          <Table head={["名前", "時間", "休憩", "実働", "対象", "状態", ""]}>
            {data.templates.map((t) => {
              const work = spanBetween(hhmm(t.start_time), hhmm(t.end_time)) - t.break_minutes;
              const breakShort = t.break_minutes < requiredBreakMinutes(work);
              return (
                <tr key={t.template_id} className={t.is_active ? "" : "text-slate-400"}>
                  <Td className="font-medium">{t.name}</Td>
                  <Td>
                    {hhmm(t.start_time)}〜{t.end_time <= t.start_time ? "翌" : ""}
                    {hhmm(t.end_time)}
                  </Td>
                  <Td>
                    {t.break_minutes}分{breakShort && <span className="ml-1 text-amber-700">⚠ 休憩不足</span>}
                  </Td>
                  <Td>
                    {formatMinutes(work)}
                    {work > 480 && <span className="ml-1 text-amber-700">⚠ 8時間超</span>}
                  </Td>
                  <Td>{t.clinic_id ? <Badge tone="blue">この院</Badge> : <Badge>全院共通</Badge>}</Td>
                  <Td>{t.is_active ? <Badge tone="green">使用中</Badge> : <Badge>停止</Badge>}</Td>
                  <Td>
                    {t.clinic_id && (
                      <ActionForm action={toggleTemplate} submitLabel={t.is_active ? "停止" : "再開"} tone="secondary">
                        <input type="hidden" name="template_id" value={t.template_id} />
                        <input type="hidden" name="clinic_id" value={clinicId} />
                        <input type="hidden" name="is_active" value={t.is_active ? "false" : "true"} />
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="この院のパターンを追加">
        <ActionForm action={saveTemplate} submitLabel="追加" className="grid gap-4 sm:grid-cols-6">
          <input type="hidden" name="clinic_id" value={clinicId} />
          <Field label="名前">
            <Input name="name" maxLength={20} placeholder="例：通し" required />
          </Field>
          <Field label="開始">
            <Input name="start_time" type="time" defaultValue="09:00" required />
          </Field>
          <Field label="終了">
            <Input name="end_time" type="time" defaultValue="20:00" required />
          </Field>
          <Field label="休憩（分）" hint="6時間超45分・8時間超60分以上">
            <Input name="break_minutes" type="number" min={0} max={600} step={15} defaultValue={180} required />
          </Field>
          <Field label="色">
            <Select name="color" defaultValue="sky">
              {COLORS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="表示順">
            <Input name="display_order" type="number" min={0} defaultValue={100} />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
