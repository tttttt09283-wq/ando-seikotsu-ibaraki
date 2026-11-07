import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { markNotificationsRead } from "../leave/actions";
import { formatJstDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "通知" };

export default async function NotificationsPage() {
  await requireMe();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">通知</h1>
      <Card>
        <CardHeader><CardTitle>未読 {unread}件</CardTitle>{unread ? <form action={markNotificationsRead}><SubmitButton size="sm" variant="outline">すべて既読にする</SubmitButton></form> : null}</CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {(data ?? []).map((n) => (
              <li key={n.id} className={n.read_at ? "" : "bg-brand-50"}>
                <Link href={n.link ?? "#"} className="block px-4 py-3">
                  <p className="font-bold">{n.read_at ? "" : "● "}{n.title}</p>
                  {n.body ? <p className="text-sm text-stone-600">{n.body}</p> : null}
                  <p className="text-xs text-stone-500">{formatJstDateTime(n.created_at)}</p>
                </Link>
              </li>
            ))}
            {(data ?? []).length === 0 ? <li className="px-4 py-6 text-center text-sm text-stone-500">通知はありません</li> : null}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
