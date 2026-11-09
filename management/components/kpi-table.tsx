import Link from "next/link";
import { rate, rateTone, countTone, fmtRate, num, totalRow, shiftMonth, type KpiRow, type Tone } from "@/lib/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const toneCls: Record<Tone, string> = {
  ok: "bg-green-50 text-green-900", warn: "bg-amber-50 text-amber-900", bad: "bg-red-50 text-red-800 font-bold", none: "text-stone-400",
};
type Col = { key: string; label: string; sub?: string; cell: (r: KpiRow) => { text: string; tone: Tone; href?: string } };

// 院×KPI の表（行＝院、列＝KPI）＋合計。数値から対象の一覧へ移れる
const cols: Col[] = [
  { key: "minutes", label: "議事録提出率", sub: "今月の開催済み", cell: (r) => { const v = rate(r.minutes_submitted, r.meetings_held); return { text: `${fmtRate(v)}（${r.minutes_submitted}/${r.meetings_held}）`, tone: rateTone(v), href: `/meetings?store=${r.store_id}` }; } },
  { key: "ontime", label: "期限内提出率", cell: (r) => { const v = rate(r.minutes_on_time, r.meetings_held); return { text: fmtRate(v), tone: rateTone(v), href: `/meetings?store=${r.store_id}` }; } },
  { key: "overdue", label: "議事録 期限超過", sub: "今の件数", cell: (r) => ({ text: `${r.minutes_overdue_now}件`, tone: countTone(r.minutes_overdue_now), href: `/meetings?store=${r.store_id}` }) },
  { key: "decisions", label: "決定事項の実行率", sub: "期限が今月", cell: (r) => { const v = rate(r.decisions_done, r.decisions_due); return { text: `${fmtRate(v)}（${r.decisions_done}/${r.decisions_due}）`, tone: rateTone(v, 80, 50), href: `/tasks?store=${r.store_id}` }; } },
  { key: "parttime", label: "アルバイト申請", sub: "今月の勤務日", cell: (r) => ({ text: `${r.parttime_total}件${r.parttime_help ? `（ヘルプ${r.parttime_help}）` : ""}${r.parttime_exception ? `・例外${r.parttime_exception}` : ""}`, tone: r.parttime_help ? "warn" : "none", href: "/part-time" }) },
  { key: "pending", label: "社長承認待ち", cell: (r) => ({ text: `${r.president_pending}件`, tone: r.president_pending ? "warn" : "ok", href: "/approvals" }) },
  { key: "paid", label: "有給取得率", sub: "暫定の定義", cell: (r) => { const v = rate(num(r.paid_taken), num(r.paid_granted)); return { text: `${fmtRate(v)}`, tone: v === null ? "none" : v >= 50 ? "ok" : v >= 25 ? "warn" : "bad", href: r.store_id === "total" ? undefined : `/store/${r.store_id}` }; } },
  { key: "fiveday", label: "年5日 未達見込み", cell: (r) => ({ text: `${r.five_day_risk}名`, tone: countTone(r.five_day_risk), href: r.store_id === "total" ? undefined : `/store/${r.store_id}` }) },
  { key: "shift", label: "振休の残り", sub: "うち期限切れ", cell: (r) => ({ text: `${num(r.shift_remaining)}日${num(r.shift_expired) ? `（期限切れ${num(r.shift_expired)}日）` : ""}`, tone: num(r.shift_expired) ? "bad" : "none", href: r.store_id === "total" ? undefined : `/store/${r.store_id}` }) },
  { key: "shortage", label: "残数不足の申請", sub: "今月", cell: (r) => ({ text: `${r.shortage_requests}件`, tone: r.shortage_requests ? "warn" : "ok", href: "/approvals" }) },
  { key: "rules", label: "規定 未確認", cell: (r) => ({ text: `${r.rule_unack}名`, tone: r.rule_unack ? "warn" : "ok", href: "/rules" }) },
];

export function KpiTable({ rows, month, basePath, title = "院ごとの状況" }: { rows: KpiRow[]; month: string; basePath: string; title?: string }) {
  const all = rows.length > 1 ? [...rows, totalRow(rows)] : rows;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}（{month.replace("-", "年")}月）</CardTitle>
        <nav className="flex items-center gap-1 text-sm">
          <Link href={`${basePath}?month=${shiftMonth(month, -1)}`} className="rounded border border-stone-300 px-2 py-1">‹ 前の月</Link>
          <Link href={basePath} className="rounded border border-stone-300 px-2 py-1">今月</Link>
          <Link href={`${basePath}?month=${shiftMonth(month, 1)}`} className="rounded border border-stone-300 px-2 py-1">次の月 ›</Link>
        </nav>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 text-left text-stone-600">
                <th className="sticky left-0 z-10 bg-stone-50 px-3 py-2">院</th>
                {cols.map((c) => <th key={c.key} className="px-2 py-2 font-bold whitespace-nowrap">{c.label}{c.sub ? <span className="block font-normal text-stone-400">{c.sub}</span> : null}</th>)}
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.store_id} className={`border-t border-stone-100 ${r.store_id === "total" ? "bg-stone-50 font-bold" : ""}`}>
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left whitespace-nowrap">
                    {r.store_id === "total" ? "合計" : <Link href={`/store/${r.store_id}`} className="text-brand-700">{r.store_name}</Link>}
                    <span className="block text-[10px] font-normal text-stone-400">{r.staff_count}名</span>
                  </th>
                  {cols.map((c) => {
                    const v = c.cell(r);
                    const inner = <span className={`block rounded px-2 py-1.5 whitespace-nowrap ${toneCls[v.tone]}`}>{v.text}</span>;
                    return <td key={c.key} className="px-1 py-1">{v.href ? <Link href={v.href} className="block hover:opacity-80">{inner}</Link> : inner}</td>;
                  })}
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={cols.length + 1} className="px-3 py-4 text-stone-500">表示できる院がありません</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-[11px] text-stone-500">赤＝対応が必要／黄＝注意／緑＝良好（数値も必ず表示）。有給取得率は暫定の定義：その月に有効な付与の日数のうち取得済みの割合（Q-19 で確定予定）。</p>
      </CardContent>
    </Card>
  );
}
