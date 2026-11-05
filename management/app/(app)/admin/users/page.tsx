import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { ROLE_LABEL, type RoleCode } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/flash";

export const metadata: Metadata = { title: "スタッフ管理" };

type UserRow = {
  id: string; name: string; login_id: string; staff_code: string; status: string; employment_type: string; must_change_password: boolean;
  user_store_assignments: { store_id: string; ends_on: string | null; is_primary: boolean; roles: { code: RoleCode } | null; stores: { name: string; display_order: number } | null }[];
  user_roles: { ends_on: string | null; roles: { code: RoleCode } | null }[];
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ store?: string; retired?: string; ok?: string; err?: string }> }) {
  if (!(await can("master.manage"))) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: stores }, { data }] = await Promise.all([
    supabase.from("stores").select("id, name").order("display_order"),
    supabase.from("users").select("id, name, login_id, staff_code, status, employment_type, must_change_password, user_store_assignments(store_id, ends_on, is_primary, roles(code), stores(name, display_order)), user_roles(ends_on, roles(code))").order("staff_code"),
  ]);
  let users = (data ?? []) as unknown as UserRow[];
  if (sp.retired !== "1") users = users.filter((u) => u.status !== "retired");
  if (sp.store) users = users.filter((u) => u.user_store_assignments.some((a) => a.store_id === sp.store && a.ends_on === null));
  const q = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ store: sp.store, retired: sp.retired, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-brand-800">スタッフ管理</h1>
        <Button asChild><Link href="/admin/users/new">＋ スタッフ登録・ID/PASS発行</Link></Button>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <nav aria-label="店舗で絞り込み" className="flex flex-wrap gap-1.5">
        <Link href={q({ store: undefined })} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${!sp.store ? "border-brand-800 bg-brand-800 text-white" : "border-stone-300 bg-white"}`}>すべて</Link>
        {(stores ?? []).map((s) => (
          <Link key={s.id} href={q({ store: s.id })} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${sp.store === s.id ? "border-brand-800 bg-brand-800 text-white" : "border-stone-300 bg-white"}`}>{s.name}</Link>
        ))}
        <Link href={q({ retired: sp.retired === "1" ? undefined : "1" })} className="ml-auto rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm">{sp.retired === "1" ? "退職者を隠す" : "退職者も表示"}</Link>
      </nav>
      <Card>
        <CardHeader><CardTitle>{users.length}名</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {users.map((u) => {
              const roles = [
                ...u.user_roles.filter((r) => r.ends_on === null && r.roles).map((r) => ROLE_LABEL[r.roles!.code]),
                ...u.user_store_assignments.filter((a) => a.ends_on === null && a.roles)
                  .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                  .map((a) => `${a.stores?.name ?? ""} ${ROLE_LABEL[a.roles!.code]}`),
              ];
              return (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-stone-50">
                    <span className="font-bold">{u.name}</span>
                    <span className="font-mono text-xs text-stone-500">{u.staff_code} / {u.login_id}</span>
                    <span className="flex grow flex-wrap justify-end gap-1">
                      {roles.length ? roles.map((r) => <Badge key={r}>{r}</Badge>) : <Badge tone="warn">所属なし</Badge>}
                      {u.status === "retired" ? <Badge tone="danger">退職</Badge> : null}
                      {u.status === "active" && u.must_change_password ? <Badge tone="warn">PASS未変更</Badge> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
