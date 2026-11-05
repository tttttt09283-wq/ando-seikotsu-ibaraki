import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { ROLE_LABEL, type RoleCode } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "院長ダッシュボード" };

export default async function StorePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(storeId) || !(await can("staff.view.store", storeId))) notFound();
  const supabase = await createClient();
  const [{ data: store }, { data: rows }] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    supabase.from("user_store_assignments")
      .select("is_primary, starts_on, roles(code), users(id, name, employment_type, status)")
      .eq("store_id", storeId).is("ends_on", null),
  ]);
  if (!store) notFound();
  type Row = { is_primary: boolean; starts_on: string; roles: { code: RoleCode } | null; users: { id: string; name: string; employment_type: string; status: string } | null };
  const staff = ((rows ?? []) as unknown as Row[]).filter((r) => r.users).sort((a, b) => (a.roles?.code ?? "").localeCompare(b.roles?.code ?? ""));
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">{store.name}</h1>
      <PhaseNote phase="PHASE 4〜9">会議予定・議事録の提出期限・振休の承認待ち・スタッフ別の残数・申請状況をここに表示します。</PhaseNote>
      <Card>
        <CardHeader><CardTitle>在籍スタッフ（{staff.length}名）</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-stone-100">
            {staff.map((r) => (
              <li key={r.users!.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-bold">{r.users!.name}{r.users!.status === "retired" ? "（退職）" : ""}</span>
                <span className="flex gap-1.5">
                  <Badge tone={r.roles?.code === "MANAGER" ? "brand" : "neutral"}>{r.roles ? ROLE_LABEL[r.roles.code] : "-"}</Badge>
                  <Badge>{r.users!.employment_type}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
