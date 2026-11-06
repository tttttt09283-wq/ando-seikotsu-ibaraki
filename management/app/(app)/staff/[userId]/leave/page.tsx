import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, requireMe } from "@/server/session";
import { getLeaveOverview, TYPE_ORDER } from "@/server/leave";
import { adjustLeave, registerShift } from "@/app/(app)/admin/leave/actions";
import { LEAVE_TYPE_LABEL, fmtDays, type GrantState, type LeaveTypeCode } from "@/lib/leave/types";
import { formatDate, formatJstDateTime, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Field } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { PaidCard, ShiftCard, FiveDayCard } from "@/components/leave-cards";

export const metadata: Metadata = { title: "休暇の明細" };

const SOURCE: Record<string, string> = { statutory: "法定付与", company: "会社付与", migration: "移行時点の残数", shift_earned: "出勤による発生", comp_earned: "代休の発生", manual: "手動付与" };
const STATE: Record<GrantState["state"], { text: string; tone: "ok" | "neutral" | "warn" | "danger" }> = {
  active: { text: "有効", tone: "ok" }, future: { text: "付与前", tone: "neutral" }, expired_lapsed: { text: "失効", tone: "neutral" }, expired_alert: { text: "期限切れ", tone: "danger" },
};

export default async function StaffLeavePage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireMe();
  const { userId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(userId)) notFound();
  const supabase = await createClient();
  const { data: person } = await supabase.from("users").select("id, name, hire_date, employment_type").eq("id", userId).maybeSingle();
  if (!person) notFound(); // 見る権限が無い人は RLS で見えない
  const [overview, canAdjust, { data: canShift }, { data: usage }, { data: adjustments }] = await Promise.all([
    getLeaveOverview(userId),
    can("leave.adjust"),
    supabase.rpc("can_register_shift_for", { p_user: userId }),
    supabase.from("leave_usage").select("usage_date, days, status, leave_types(code)").eq("user_id", userId).order("usage_date", { ascending: false }).limit(100),
    supabase.from("leave_adjustments").select("delta_days, reason, adjusted_at, leave_grants(grant_date, leave_types(code)), adjusted_by").eq("user_id", userId).order("adjusted_at", { ascending: false }),
  ]);
  const b = overview.balances;
  const allGrants = TYPE_ORDER.flatMap((t) => (b[t as "PAID" | "SHIFT" | "SHIFT_HOLIDAY"].grants ?? []).map((g) => ({ ...g, type: t })));
  type Usage = { usage_date: string; days: number; status: string; leave_types: { code: LeaveTypeCode } | null };
  type Adj = { delta_days: number; reason: string; adjusted_at: string; leave_grants: { grant_date: string; leave_types: { code: LeaveTypeCode } | null } | null };
  return (
    <>
      <div>
        {me.id === userId ? <Link href="/me" className="text-sm text-brand-700">‹ マイページ</Link> : null}
        <h1 className="text-xl font-black text-brand-800">{person.name} さんの休暇</h1>
        <p className="text-sm text-stone-600">入社日：{formatDate(person.hire_date)}（有給は入社日基準で付与）</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 md:grid-cols-2">
        <PaidCard b={b.PAID} />
        <ShiftCard shift={b.SHIFT} holiday={b.SHIFT_HOLIDAY} />
        <FiveDayCard f={overview.fiveDay} />
      </div>

      <Card>
        <CardHeader><CardTitle>付与ごとの明細（有効期限の早い順）</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-600">
              <tr><th className="px-3 py-2">区分</th><th className="px-3 py-2">付与日</th><th className="px-3 py-2">有効期限</th><th className="px-3 py-2 text-right">付与</th><th className="px-3 py-2 text-right">修正</th><th className="px-3 py-2 text-right">取得済み</th><th className="px-3 py-2 text-right">予定</th><th className="px-3 py-2 text-right">残り</th><th className="px-3 py-2">状態</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {allGrants.map((g) => (
                <tr key={g.grant_id} className={g.state === "expired_lapsed" ? "text-stone-400" : ""}>
                  <td className="px-3 py-2">{LEAVE_TYPE_LABEL[g.type]}<br /><span className="text-xs text-stone-500">{SOURCE[g.source] ?? g.source}</span></td>
                  <td className="px-3 py-2">{formatDate(g.grant_date)}</td>
                  <td className="px-3 py-2">{formatDate(g.expires_on)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtDays(g.days)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.adjusted ? fmtDays(g.adjusted) : "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtDays(g.taken)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtDays(g.planned)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtDays(g.remaining)}</td>
                  <td className="px-3 py-2"><Badge tone={STATE[g.state].tone}>{STATE[g.state].text}</Badge></td>
                </tr>
              ))}
              {allGrants.length === 0 ? <tr><td colSpan={9} className="px-3 py-6 text-center text-stone-500">付与の記録はまだありません</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>取得の履歴</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-stone-100 text-sm">
              {((usage ?? []) as unknown as Usage[]).map((u, i) => (
                <li key={i} className="flex justify-between py-2"><span>{formatDate(u.usage_date)} {u.leave_types ? LEAVE_TYPE_LABEL[u.leave_types.code] : ""}</span>
                  <span>{fmtDays(u.days)} <Badge tone={u.status === "taken" ? "ok" : u.status === "planned" ? "brand" : "neutral"}>{u.status === "taken" ? "取得済み" : u.status === "planned" ? "予定" : "取消"}</Badge></span></li>
              ))}
              {(usage ?? []).length === 0 ? <li className="py-2 text-stone-500">まだありません（申請・承認は PHASE 4 で追加）</li> : null}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>管理者による修正の記録</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-stone-100 text-sm">
              {((adjustments ?? []) as unknown as Adj[]).map((a, i) => (
                <li key={i} className="py-2"><b>{a.delta_days > 0 ? "+" : ""}{fmtDays(a.delta_days)}</b>（{a.leave_grants?.leave_types ? LEAVE_TYPE_LABEL[a.leave_grants.leave_types.code] : ""} {formatDate(a.leave_grants?.grant_date)}付与分）
                  <br /><span className="text-stone-600">{a.reason}</span><br /><span className="text-xs text-stone-500">{formatJstDateTime(a.adjusted_at)}</span></li>
              ))}
              {(adjustments ?? []).length === 0 ? <li className="py-2 text-stone-500">ありません</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
      {canAdjust ? (
          <Card>
            <CardHeader><CardTitle>残数を修正（社長）</CardTitle></CardHeader>
            <CardContent>
              <form action={adjustLeave} className="grid gap-3">
                <input type="hidden" name="user_id" value={userId} />
                <Field label="対象の付与">
                  <Select name="grant_id" required defaultValue="">
                    <option value="" disabled>選択</option>
                    {allGrants.filter((g) => g.state !== "expired_lapsed").map((g) => <option key={g.grant_id} value={g.grant_id}>{LEAVE_TYPE_LABEL[g.type]} {g.grant_date}付与（残り{g.remaining}日）</option>)}
                  </Select>
                </Field>
                <Field label="修正日数" hint="増やす：1、減らす：-0.5 など（0.5日刻み）"><Input name="delta" inputMode="decimal" required placeholder="例：-1" /></Field>
                <Field label="修正理由（必須・記録に残ります）"><Input name="reason" required minLength={2} maxLength={300} /></Field>
                <div><SubmitButton variant="outline">修正する</SubmitButton></div>
              </form>
            </CardContent>
          </Card>
      ) : null}
      {canShift ? (
          <Card>
            <CardHeader><CardTitle>振休の発生を登録</CardTitle></CardHeader>
            <CardContent>
              <form action={registerShift} className="grid gap-3">
                <input type="hidden" name="user_id" value={userId} />
                <Field label="区分"><Select name="type_code" defaultValue="SHIFT"><option value="SHIFT">振替（公休出勤）</option><option value="SHIFT_HOLIDAY">祝振替（祝日出勤）</option></Select></Field>
                <Field label="出勤した日" hint="1日分を登録。期限はその月の末日になります"><Input name="work_date" type="date" required max={jstToday()} /></Field>
                <Field label="メモ"><Input name="note" maxLength={300} /></Field>
                <div><SubmitButton variant="outline">振休を1日登録</SubmitButton></div>
              </form>
            </CardContent>
          </Card>
      ) : null}
      </div>
    </>
  );
}
