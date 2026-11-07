import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { getLeaveOverview } from "@/server/leave";
import { jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveForm, type Person } from "./leave-form";

export const metadata: Metadata = { title: "休暇の申請" };

export default async function NewLeavePage() {
  const me = await requireMe();
  const supabase = await createClient();
  const toPerson = (id: string, name: string, self: boolean, o: Awaited<ReturnType<typeof getLeaveOverview>>): Person => ({
    id, name, self,
    paid: { available: o.balances.PAID.after_planned, pending: o.balances.PAID.pending },
    shift: {
      available: o.balances.SHIFT.after_planned + o.balances.SHIFT_HOLIDAY.after_planned,
      pending: o.balances.SHIFT.pending,
      nextExpiry: [o.balances.SHIFT.next_expiry_date, o.balances.SHIFT_HOLIDAY.next_expiry_date].filter(Boolean).sort()[0] ?? null,
    },
  });
  const people: Person[] = [toPerson(me.id, me.name, true, await getLeaveOverview(me.id))];
  // 院長は自院スタッフの有給を代理で申請できる
  for (const s of me.stores.filter((x) => x.role === "MANAGER")) {
    const { data: can } = await supabase.rpc("can", { p_permission: "leave.request.proxy", p_store: s.store_id });
    if (!can) continue;
    const { data: staff } = await supabase.from("user_store_assignments").select("user_id, is_primary, users(name, status)").eq("store_id", s.store_id).is("ends_on", null).eq("is_primary", true);
    for (const row of (staff ?? []) as unknown as { user_id: string; users: { name: string; status: string } | null }[]) {
      if (row.user_id === me.id || row.users?.status !== "active" || people.some((p) => p.id === row.user_id)) continue;
      people.push(toPerson(row.user_id, `${row.users.name}（${s.store}）`, false, await getLeaveOverview(row.user_id)));
    }
  }
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">休暇の申請</h1>
      <Card>
        <CardHeader><CardTitle>有給・振休</CardTitle></CardHeader>
        <CardContent><LeaveForm people={people} idempotencyKey={randomUUID()} today={jstToday()} /></CardContent>
      </Card>
    </>
  );
}
