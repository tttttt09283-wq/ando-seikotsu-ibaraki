"use client";

import { useState, useTransition } from "react";
import { DAY_CODE_TONE, DAY_CODES, groupOf } from "@/lib/holiday/codes";
import type { CalendarMonth } from "@/lib/holiday/calendar";
import { WEEKDAY_LABELS } from "@/lib/time/jst";
import { setDayRecord } from "./actions";

/**
 * 1人・12か月の区分カレンダー（今の勤怠管理表と同じ並び：縦に1〜31日、横に月）。
 * 区分を選ぶとすぐ保存される。区分の無い日はシステムの記録を薄く表示する。
 */
export function HolidayCalendar({ staffId, months }: { staffId: string; months: CalendarMonth[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = (date: string, code: string) =>
    startTransition(async () => {
      const r = await setDayRecord(staffId, date, code || null);
      setMessage({ ok: r.ok, text: r.message });
    });

  return (
    <div>
      <div className="mb-2 flex h-6 items-center gap-3 text-sm">
        {pending && <span className="text-slate-500">保存中…</span>}
        {!pending && message && (
          <span role="status" className={message.ok ? "text-emerald-700" : "text-rose-700"}>
            {message.text}
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-1 text-left font-medium">日</th>
              {months.map((m) => (
                <th key={m.month} className="border-l border-slate-200 px-2 py-1 text-left font-medium whitespace-nowrap">
                  {Number(m.month.slice(5))}月<span className="ml-1 text-slate-400">{m.month.slice(0, 4)}</span>
                  {m.days[0]?.closed && <span className="ml-1 text-slate-400">（締め済み）</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <tr key={day} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-2 py-0.5 text-slate-500">{day}</td>
                {months.map((m) => {
                  const d = m.days.find((x) => x.day === day);
                  if (!d) return <td key={m.month} className="border-l border-slate-200 bg-slate-50" />;
                  const weekend = d.weekday === 0 ? "text-rose-600" : d.weekday === 6 ? "text-sky-600" : "text-slate-500";
                  const tone = d.code ? DAY_CODE_TONE[groupOf(d.code)] : "";
                  return (
                    <td key={m.month} className={`border-l border-slate-200 px-1 py-0.5 ${tone}`}>
                      <div className="flex items-center gap-1">
                        <span className={`w-3 shrink-0 ${weekend}`}>{WEEKDAY_LABELS[d.weekday]}</span>
                        <select
                          aria-label={`${d.date}の区分`}
                          value={d.code ?? ""}
                          disabled={d.closed || pending}
                          onChange={(e) => save(d.date, e.target.value)}
                          title={d.code ? DAY_CODES.find((c) => c.code === d.code)?.description : d.hint ? `システムの記録：${d.hint}` : undefined}
                          className={`w-16 cursor-pointer appearance-none rounded border-0 bg-transparent px-0.5 py-0 text-xs hover:bg-white/70 ${d.code ? "font-medium" : "text-slate-400"}`}
                        >
                          <option value="">{d.hint ? `(${d.hint})` : ""}</option>
                          {DAY_CODES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        {d.source === "import" && <span title="勤怠管理表から取込" className="text-[10px] text-slate-400">取</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        （ ）内はシステムの記録（確定シフト・承認済みの休暇・勤怠）からの参考です。区分を選ぶと保存され、「法定内」「法定外」は勤怠の法定休日の計算に使われます。
        「取」は勤怠管理表から取り込んだ区分です。
      </p>
    </div>
  );
}
