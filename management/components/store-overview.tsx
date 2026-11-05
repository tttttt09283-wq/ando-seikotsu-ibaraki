import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// 見られる店舗と在籍人数（RLS で見える範囲だけが返る）
export async function StoreOverview() {
  const supabase = await createClient();
  const [{ data: visible }, { data: stores }, { data: assigns }] = await Promise.all([
    supabase.rpc("visible_store_ids"),
    supabase.from("stores").select("id, name, display_order, is_active").order("display_order"),
    supabase.from("user_store_assignments").select("store_id, ends_on, starts_on").is("ends_on", null),
  ]);
  const ids = new Set(((visible as string[] | null) ?? []));
  const list = (stores ?? []).filter((s) => ids.has(s.id));
  const count = (id: string) => (assigns ?? []).filter((a) => a.store_id === id).length;
  return (
    <Card>
      <CardHeader><CardTitle>店舗（{list.length}院）</CardTitle></CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((s) => (
            <li key={s.id}>
              <Link href={`/store/${s.id}`} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5 hover:border-brand-600">
                <span className="font-bold">{s.name}{s.is_active ? "" : "（休止中）"}</span>
                <span className="text-sm text-stone-500">{count(s.id)}名</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
