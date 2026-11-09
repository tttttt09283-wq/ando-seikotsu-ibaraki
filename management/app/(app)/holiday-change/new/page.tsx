import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { holidayChangeCandidates } from "@/server/holiday-change";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HolidayChangeForm } from "./holiday-change-form";

export const metadata: Metadata = { title: "振休→アルバイト勤務の申請" };

export default async function NewHolidayChangePage() {
  const me = await requireMe();
  const supabase = await createClient();
  const stores: { id: string; name: string }[] = [];
  for (const s of me.stores.filter((x) => x.role === "MANAGER")) {
    const { data } = await supabase.rpc("can", { p_permission: "holidaychange.request", p_store: s.store_id });
    if (data) stores.push({ id: s.store_id, name: s.store });
  }
  if (!stores.length) notFound();
  const lists = await Promise.all(stores.map((s) => holidayChangeCandidates(s.id)));
  const candidates = stores.flatMap((s, i) => lists[i].map((c) => ({ ...c, store_id: s.id })));
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">振休→アルバイト勤務の申請</h1>
      <Card>
        <CardHeader><CardTitle>変更の内容</CardTitle><span className="text-xs text-stone-600">GMの確認 → 社長の承認</span></CardHeader>
        <CardContent><HolidayChangeForm stores={stores} candidates={candidates} idempotencyKey={randomUUID()} /></CardContent>
      </Card>
    </>
  );
}
