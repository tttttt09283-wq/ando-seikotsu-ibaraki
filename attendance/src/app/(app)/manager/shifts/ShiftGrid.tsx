"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/errors";
import { formatMinutes, shiftLabel, SHIFT_STATUS_LABELS, type ShiftView } from "@/lib/shifts/model";
import type { ClinicDay, ShiftWarning } from "@/lib/shifts/warnings";
import { WEEKDAY_LABELS } from "@/lib/time/jst";
import { applyShiftEdit } from "./actions";

export interface GridTemplate {
  template_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
}

export interface GridData {
  clinicId: string;
  month: string;
  closed: boolean;
  days: (ClinicDay & { weekday: number })[];
  staff: { staffId: string; code: string; name: string; primary: boolean; assignedDates: string[]; primaryDates: string[] }[];
  shifts: ShiftView[];
  templates: GridTemplate[];
  cellWarnings: Record<string, ShiftWarning[]>;
  missing: Record<string, true>;
  noStaffDates: string[];
}

type Mode = "template" | "custom" | "day_off" | "cancel";

const COLOR_CLASS: Record<string, string> = {
  sky: "bg-sky-100 text-sky-900",
  emerald: "bg-emerald-100 text-emerald-900",
  amber: "bg-amber-100 text-amber-900",
  rose: "bg-rose-100 text-rose-900",
  violet: "bg-violet-100 text-violet-900",
  slate: "bg-slate-200 text-slate-800",
};

const key = (staffId: string, date: string) => `${staffId}|${date}`;

export function ShiftGrid({ data }: { data: GridData }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("template");
  const [templateId, setTemplateId] = useState(data.templates[0]?.template_id ?? "");
  const [custom, setCustom] = useState({ start: "09:00", end: "18:00", breakMinutes: 60 });
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const byCell = useMemo(() => {
    const map = new Map<string, ShiftView[]>();
    for (const s of data.shifts) {
      const k = key(s.staffId, s.workDate);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [data.shifts]);
  const templateById = useMemo(() => new Map(data.templates.map((t) => [t.template_id, t])), [data.templates]);
  const assigned = useMemo(() => new Map(data.staff.map((s) => [s.staffId, new Set(s.assignedDates)])), [data.staff]);
  const noStaff = new Set(data.noStaffDates);

  const selectable = (staffId: string, date: string) => !data.closed && Boolean(assigned.get(staffId)?.has(date));
  const toggle = (keys: string[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  const selectedCells = [...selected].map((k) => {
    const [staffId, date] = k.split("|");
    return { staffId, date, shifts: byCell.get(k) ?? [] };
  });
  const needsReason = selectedCells.some((c) => c.shifts.some((s) => s.status === "confirmed" || s.status === "revised"));

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      const res = await applyShiftEdit({
        clinic_id: data.clinicId,
        month: data.month,
        mode,
        template_id: mode === "template" ? templateId : undefined,
        start: mode === "custom" ? custom.start : undefined,
        end: mode === "custom" ? custom.end : undefined,
        break_minutes: mode === "custom" ? custom.breakMinutes : undefined,
        reason: reason || undefined,
        cells: selectedCells.map((c) => ({
          staff_id: c.staffId,
          date: c.date,
          shifts: c.shifts.map((s) => ({ shift_id: s.shiftId, version: s.version, status: s.status, type: s.type })),
        })),
      });
      setResult(res);
      if (res.ok) {
        setSelected(new Set());
        setReason("");
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-36 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-left">スタッフ</th>
              {data.days.map((d) => {
                const closed = d.slots.length === 0;
                return (
                  <th
                    key={d.date}
                    className={`min-w-16 cursor-pointer border-b border-r border-slate-200 px-1 py-1 text-center font-medium ${closed ? "bg-slate-100 text-slate-400" : "bg-slate-50"} ${d.holidayName || d.weekday === 0 ? "text-rose-600" : d.weekday === 6 ? "text-sky-700" : ""}`}
                    title={`${d.holidayName ?? ""}${closed ? " 休診" : ` 診療 ${d.slots.map((s) => `${s.open}-${s.close}`).join(" / ")}`}（クリックで列を選択）`}
                    onClick={() => toggle(data.staff.filter((s) => selectable(s.staffId, d.date)).map((s) => key(s.staffId, d.date)))}
                  >
                    <div>{Number(d.date.slice(8))}</div>
                    <div>{d.holidayName ? "祝" : WEEKDAY_LABELS[d.weekday]}</div>
                    {closed && <div className="text-[10px]">休診</div>}
                    {noStaff.has(d.date) && <div className="text-[10px] text-amber-600">⚠0人</div>}
                  </th>
                );
              })}
              <th className="min-w-20 border-b border-slate-200 bg-slate-50 px-2 py-1">月合計</th>
            </tr>
          </thead>
          <tbody>
            {data.staff.map((st) => {
              const mine = data.shifts.filter((s) => s.staffId === st.staffId && s.type === "work");
              const total = mine.reduce((sum, s) => sum + s.workMinutes, 0);
              const days = new Set(mine.map((s) => s.workDate)).size;
              return (
                <tr key={st.staffId}>
                  <th
                    className="sticky left-0 z-10 cursor-pointer border-b border-r border-slate-200 bg-white px-2 py-1 text-left font-normal"
                    title="クリックで行を選択"
                    onClick={() => toggle(data.days.filter((d) => selectable(st.staffId, d.date)).map((d) => key(st.staffId, d.date)))}
                  >
                    <div className="font-medium">{st.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {st.code} {st.primary ? "" : "（応援）"}
                    </div>
                  </th>
                  {data.days.map((d) => {
                    const k = key(st.staffId, d.date);
                    const cellShifts = byCell.get(k) ?? [];
                    const warnings = data.cellWarnings[k] ?? [];
                    const canSelect = selectable(st.staffId, d.date);
                    const isSelected = selected.has(k);
                    return (
                      <td
                        key={d.date}
                        onClick={() => canSelect && toggle([k])}
                        title={[...cellShifts.map((s) => `${shiftLabel(s)} 休憩${s.breakMinutes}分（${SHIFT_STATUS_LABELS[s.status]}）`), ...warnings.map((w) => `⚠ ${w.message}`)].join("\n")}
                        className={`h-12 border-b border-r border-slate-200 px-0.5 py-0.5 align-top ${canSelect ? "cursor-pointer hover:bg-brand-50" : "bg-slate-100"} ${isSelected ? "outline outline-2 -outline-offset-2 outline-brand-600" : ""} ${d.slots.length === 0 && canSelect ? "bg-slate-50" : ""}`}
                      >
                        {cellShifts.map((s) => {
                          const template = s.templateId ? templateById.get(s.templateId) : undefined;
                          return (
                            <div
                              key={s.shiftId}
                              className={`mb-0.5 rounded px-0.5 leading-tight ${s.type === "work" ? COLOR_CLASS[template?.color ?? "slate"] : "bg-white text-slate-500 ring-1 ring-slate-300"} ${s.status === "draft" ? "border border-dashed border-slate-400" : ""}`}
                            >
                              <div className="font-medium">{s.type === "work" ? (template?.name ?? "勤務") : shiftLabel(s)}</div>
                              {s.type === "work" && (
                                <div className="text-[10px]">
                                  {s.start}-{s.endsNextDay ? "翌" : ""}
                                  {s.end}
                                </div>
                              )}
                              {s.status === "revised" && <div className="text-[10px] text-amber-700">変更あり</div>}
                            </div>
                          );
                        })}
                        {data.missing[k] && <div className="text-[10px] text-amber-600">未作成</div>}
                        {warnings.some((w) => w.level !== "info") && (
                          <div className={`text-[10px] ${warnings.some((w) => w.level === "error") ? "text-rose-600" : "text-amber-600"}`}>⚠</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b border-slate-200 px-2 py-1 text-center">
                    <div>{days}日</div>
                    <div className="text-[10px] text-slate-500">{formatMinutes(total)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        点線枠＝下書き、枠なし＝確定。スタッフ名・日付をクリックすると行・列をまとめて選択できます。灰色の欄はその日に所属・応援登録がないため入力できません。
      </p>

      {!data.closed && (
        <div className="sticky bottom-0 z-20 mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <div>
              <div className="font-bold">{selected.size}欄を選択中</div>
              {selected.size > 0 && (
                <button type="button" className="text-xs text-brand-700 underline" onClick={() => setSelected(new Set())}>
                  選択解除
                </button>
              )}
            </div>
            <fieldset className="flex flex-wrap gap-3">
              <legend className="sr-only">操作</legend>
              {(
                [
                  ["template", "パターン"],
                  ["custom", "時刻を指定"],
                  ["day_off", "休み"],
                  ["cancel", "取り消し"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1">
                  <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                  {label}
                </label>
              ))}
            </fieldset>
            {mode === "template" && (
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                aria-label="勤務パターン"
                className="rounded-md border border-slate-300 px-2 py-1.5"
              >
                {data.templates.map((t) => (
                  <option key={t.template_id} value={t.template_id}>
                    {t.name}（{t.start_time.slice(0, 5)}-{t.end_time.slice(0, 5)} 休憩{t.break_minutes}分）
                  </option>
                ))}
              </select>
            )}
            {mode === "custom" && (
              <div className="flex items-center gap-1">
                <input type="time" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} aria-label="開始" className="rounded-md border border-slate-300 px-2 py-1.5" />
                〜
                <input type="time" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} aria-label="終了" className="rounded-md border border-slate-300 px-2 py-1.5" />
                <label className="ml-2 flex items-center gap-1">
                  休憩
                  <input
                    type="number"
                    min={0}
                    max={600}
                    step={15}
                    value={custom.breakMinutes}
                    onChange={(e) => setCustom({ ...custom, breakMinutes: Number(e.target.value) })}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1.5"
                  />
                  分
                </label>
                <span className="text-xs text-slate-500">終了が開始より前なら翌日終了</span>
              </div>
            )}
            <label className="flex min-w-60 flex-1 flex-col gap-1">
              <span className={needsReason ? "font-medium text-rose-700" : "text-slate-600"}>
                変更理由{needsReason ? "（確定済みを含むため必須）" : "（任意）"}
              </span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <button
              type="button"
              disabled={pending || selected.size === 0 || (needsReason && !reason.trim()) || (mode === "template" && !templateId)}
              onClick={submit}
              className={`rounded-md px-4 py-2 font-medium text-white disabled:opacity-50 ${mode === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-600 hover:bg-brand-700"}`}
            >
              {pending ? "保存中…" : mode === "cancel" ? "取り消す" : "適用"}
            </button>
          </div>
          {result && (
            <p role="status" className={`mt-2 text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>
              {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
