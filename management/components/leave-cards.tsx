import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { fmtDays, FIVE_DAY_LABEL, type Balance, type FiveDay } from "@/lib/leave/types";
import { formatDate } from "@/lib/time";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <dt className="text-sm text-stone-600">{label}</dt>
      <dd className={strong ? "text-xl font-black tabular-nums text-brand-800" : "text-sm font-bold tabular-nums"}>{value}</dd>
    </div>
  );
}

// 有給のカード（docs/leave-management.md §3 の表示）
export function PaidCard({ b }: { b: Balance }) {
  return (
    <Card>
      <CardHeader><CardTitle>有給休暇</CardTitle>{b.next_expiry_date ? <Badge tone="warn">{formatDate(b.next_expiry_date)}に{fmtDays(b.next_expiry_days)}失効</Badge> : null}</CardHeader>
      <CardContent>
        <dl className="divide-y divide-stone-100">
          <Row label="現在残数" value={fmtDays(b.current)} strong />
          <Row label="取得予定を反映した残数" value={fmtDays(b.after_planned)} />
          <Row label="承認済みの取得予定" value={fmtDays(b.planned)} />
          <Row label="申請中（承認待ち）" value={fmtDays(b.pending)} />
          <Row label="取得済み（有効な付与分）" value={fmtDays(b.taken)} />
          <Row label="付与（有効な分）" value={fmtDays(b.granted)} />
          {b.adjusted ? <Row label="管理者の修正" value={`${b.adjusted > 0 ? "+" : ""}${fmtDays(b.adjusted)}`} /> : null}
          {b.lapsed ? <Row label="失効した日数" value={fmtDays(b.lapsed)} /> : null}
        </dl>
      </CardContent>
    </Card>
  );
}

// 振休のカード（振替・祝振替を分けて、合計も表示。期限切れはアラート）
export function ShiftCard({ shift, holiday }: { shift: Balance; holiday: Balance }) {
  const overdue = shift.overdue + holiday.overdue;
  const next = [shift, holiday].filter((b) => b.next_expiry_date).sort((a, b) => a.next_expiry_date!.localeCompare(b.next_expiry_date!))[0];
  return (
    <Card>
      <CardHeader><CardTitle>振休</CardTitle>{next ? <Badge tone="warn">{formatDate(next.next_expiry_date)}までに取得</Badge> : null}</CardHeader>
      <CardContent className="grid gap-2">
        {overdue > 0 ? <Alert tone="danger">期限（出勤した月の末日）を過ぎた振休が {fmtDays(overdue)} あります。院長と相談して早めに取得してください。</Alert> : null}
        <dl className="divide-y divide-stone-100">
          <Row label="合計の残数" value={fmtDays(shift.current + holiday.current)} strong />
          <Row label="振替（公休出勤）" value={fmtDays(shift.current)} />
          <Row label="祝振替（祝日出勤）" value={fmtDays(holiday.current)} />
          <Row label="承認済みの取得予定" value={fmtDays(shift.planned + holiday.planned)} />
          <Row label="申請中（承認待ち）" value={fmtDays(shift.pending + holiday.pending)} />
        </dl>
      </CardContent>
    </Card>
  );
}

export function FiveDayCard({ f }: { f: FiveDay }) {
  if (!f.target) return null;
  const l = FIVE_DAY_LABEL[f.level];
  const pct = Math.min(100, (f.taken / f.required) * 100);
  return (
    <Card>
      <CardHeader><CardTitle>有給の年5日取得</CardTitle><Badge tone={l.tone}>{l.text}</Badge></CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <div className="h-2.5 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={f.taken} aria-valuemin={0} aria-valuemax={5} aria-label="年5日の取得状況">
          <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
        </div>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
          <dt className="text-stone-600">対象期間</dt><dd>{formatDate(f.period_start)}〜{formatDate(f.period_end)}</dd>
          <dt className="text-stone-600">取得済み</dt><dd className="font-bold">{fmtDays(f.taken)}／{fmtDays(f.required)}{f.planned ? `（予定 ${fmtDays(f.planned)}）` : ""}</dd>
          <dt className="text-stone-600">残り必要日数</dt><dd className="font-bold">{fmtDays(f.remaining_required)}</dd>
          <dt className="text-stone-600">取得期限</dt><dd>{formatDate(f.period_end)}（あと{f.days_left}日）</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
