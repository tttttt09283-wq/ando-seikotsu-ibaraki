import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { partTimeWorkers, shiftCutoffDay } from "@/server/part-time";
import { jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartTimeForm } from "./part-time-form";

export const metadata: Metadata = { title: "アルバイト勤務の申請" };

export default async function NewPartTimePage() {
  const me = await requireMe();
  const supabase = await createClient();
  const stores: { id: string; name: string }[] = [];
  for (const s of me.stores.filter((x) => x.role === "MANAGER")) {
    const { data } = await supabase.rpc("can", { p_permission: "parttime.request", p_store: s.store_id });
    if (data) stores.push({ id: s.store_id, name: s.store });
  }
  if (!stores.length) notFound();
  const [workers, cutoffDay] = await Promise.all([partTimeWorkers(stores.map((s) => s.id)), shiftCutoffDay()]);
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">アルバイト勤務の申請</h1>
      <Card>
        <CardHeader><CardTitle>勤務の内容</CardTitle><span className="text-xs text-stone-600">承認者：社長</span></CardHeader>
        <CardContent><PartTimeForm stores={stores} workers={workers} today={jstToday()} cutoffDay={cutoffDay} idempotencyKey={randomUUID()} /></CardContent>
      </Card>
    </>
  );
}
