import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { addGrant } from "./actions";
import { upcomingGrants } from "@/lib/leave/entitlement";
import { addDays } from "@/lib/dates";
import { jstToday, formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export const metadata: Metadata = { title: "有給の付与予定" };

export default async function LeaveAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await can("leave.adjust"))) notFound();
  const sp = await searchParams;
  const today = jstToday();
  const from = addDays(today, -60), to = addDays(today, 60);
  const supabase = await createClient();
  const [{ data: users }, { data: paidType }] = await Promise.all([
    supabase.from("users").select("id, name, staff_code, hire_date, weekly_work_days, weekly_work_hours, employment_type").eq("status", "active").order("staff_code"),
    supabase.from("leave_types").select("id").eq("code", "PAID").single(),
  ]);
  const { data: grants } = await supabase.from("leave_grants").select("user_id, grant_date").eq("leave_type_id", paidType?.id ?? "").is("voided_at", null);
  const granted = new Set((grants ?? []).map((g) => `${g.user_id}|${g.grant_date}`));
  const plans = (users ?? []).filter((u) => u.employment_type !== "役員").flatMap((u) =>
    upcomingGrants({ hire_date: u.hire_date, weekly_work_days: u.weekly_work_days, weekly_work_hours: u.weekly_work_hours }, from, to)
      .filter((p) => !granted.has(`${u.id}|${p.grantDate}`)).map((p) => ({ user: u, plan: p })))
    .sort((a, b) => a.plan.grantDate.localeCompare(b.plan.grantDate));
  const noHire = (users ?? []).filter((u) => !u.hire_date && u.employment_type !== "役員");
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">有給の付与予定（入社日基準）</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <Alert tone="info">入社日から計算した法定の付与予定です（前後60日）。<b>出勤率8割以上</b>を確認してから「付与する」を押してください。自動では付与しません。比例付与（週4日以下）の対象者の扱いは未確定（Q-10）のため、日数を確認してください。</Alert>
      {noHire.length ? <Alert tone="warn">入社日が未登録の人がいます：{noHire.map((u) => u.name).join("、")}（スタッフ管理で入社日を入れると予定が出ます）</Alert> : null}
      <Card>
        <CardHeader><CardTitle>未付与の予定（{plans.length}件）</CardTitle><Link href="/admin/import" className="text-sm font-bold text-brand-700">CSVで残数を取り込む ›</Link></CardHeader>
        <CardContent className="grid gap-2">
          {plans.map(({ user, plan }) => (
            <form key={`${user.id}-${plan.grantDate}`} action={addGrant} className="grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <input type="hidden" name="user_id" value={user.id} /><input type="hidden" name="type_code" value="PAID" />
              <input type="hidden" name="grant_date" value={plan.grantDate} /><input type="hidden" name="source" value="statutory" />
              <span>
                <b>{user.name}</b> <span className="text-xs text-stone-500">入社 {formatDate(user.hire_date)}・{plan.index + 1}回目</span><br />
                <span className="text-sm">{formatDate(plan.grantDate)}付与 {plan.grantDate < today ? <Badge tone="danger">付与日を過ぎています</Badge> : null} {plan.proportional ? <Badge tone="warn">比例付与</Badge> : null} {plan.countsToward5Day ? <Badge>年5日の対象</Badge> : null}</span>
              </span>
              <label className="flex items-center gap-1 text-sm"><Input name="days" defaultValue={plan.days} className="w-20" inputMode="decimal" aria-label="付与日数" />日</label>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="attendance_checked" required className="size-5" />出勤率8割以上を確認</label>
              <SubmitButton size="sm">付与する</SubmitButton>
            </form>
          ))}
          {plans.length === 0 ? <p className="text-sm text-stone-500">前後60日に未付与の予定はありません。</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
