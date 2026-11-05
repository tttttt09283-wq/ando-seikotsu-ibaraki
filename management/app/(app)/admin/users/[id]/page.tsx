import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, requireMe } from "@/server/session";
import { ROLE_LABEL, type RoleCode } from "@/lib/roles";
import { jstToday, formatDate } from "@/lib/time";
import { updateProfile, setStatus, addAssignment, endAssignment, addGlobalRole, endGlobalRole } from "../actions";
import { ReissuePassword } from "./reissue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export const metadata: Metadata = { title: "スタッフの詳細" };

type Assignment = { id: string; store_id: string; is_primary: boolean; starts_on: string; ends_on: string | null; roles: { code: RoleCode } | null; stores: { name: string } | null };
type GlobalRole = { id: string; starts_on: string; ends_on: string | null; roles: { code: RoleCode } | null; areas: { name: string } | null };

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await can("master.manage"))) notFound();
  const me = await requireMe();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: u }, { data: assigns }, { data: groles }, { data: stores }, { data: areas }] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).single(),
    supabase.from("user_store_assignments").select("id, store_id, is_primary, starts_on, ends_on, roles(code), stores(name)").eq("user_id", id).order("starts_on", { ascending: false }),
    supabase.from("user_roles").select("id, starts_on, ends_on, roles(code), areas(name)").eq("user_id", id).order("starts_on", { ascending: false }),
    supabase.from("stores").select("id, name").order("display_order"),
    supabase.from("areas").select("id, name").order("display_order"),
  ]);
  if (!u) notFound();
  const today = jstToday();
  const current = (e: { ends_on: string | null }) => e.ends_on === null || e.ends_on >= today;
  const isSelf = u.id === me.id;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/users" className="text-sm text-brand-700">‹ スタッフ一覧</Link>
        <h1 className="w-full text-xl font-black text-brand-800">{u.name} {u.status === "retired" ? <Badge tone="danger">退職（{formatDate(u.retired_at)}）</Badge> : null}</h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <Card>
        <CardHeader><CardTitle>プロフィール</CardTitle><span className="font-mono text-xs text-stone-500">ログインID：{u.login_id}</span></CardHeader>
        <CardContent>
          <form action={updateProfile} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={u.id} />
            <Field label="氏名"><Input name="name" defaultValue={u.name} required maxLength={40} /></Field>
            <Field label="ふりがな"><Input name="name_kana" defaultValue={u.name_kana ?? ""} maxLength={60} /></Field>
            <Field label="スタッフID"><Input name="staff_code" defaultValue={u.staff_code} required className="font-mono" /></Field>
            <Field label="雇用区分">
              <Select name="employment_type" defaultValue={u.employment_type}>{["正社員", "短時間正社員", "アルバイト", "役員"].map((v) => <option key={v}>{v}</option>)}</Select>
            </Field>
            <Field label="入社日" hint="有給の付与（入社日基準）に使います"><Input name="hire_date" type="date" defaultValue={u.hire_date ?? ""} /></Field>
            <Field label="POSのスタッフ番号"><Input name="pos_staff_id" type="number" min={1} defaultValue={u.pos_staff_id ?? ""} /></Field>
            <div className="sm:col-span-2"><SubmitButton>保存</SubmitButton></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>店舗の所属・役職</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid gap-2">
            {((assigns ?? []) as unknown as Assignment[]).map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${current(a) ? "border-stone-200" : "border-dashed border-stone-200 text-stone-400"}`}>
                <b>{a.stores?.name}</b><Badge tone={a.roles?.code === "MANAGER" ? "brand" : "neutral"}>{a.roles ? ROLE_LABEL[a.roles.code] : "-"}</Badge>
                {a.is_primary ? <Badge tone="ok">主所属</Badge> : null}
                <span className="text-xs">{formatDate(a.starts_on)}〜{a.ends_on ? formatDate(a.ends_on) : ""}</span>
                {a.ends_on === null ? (
                  <form action={endAssignment} className="ml-auto flex items-center gap-1">
                    <input type="hidden" name="id" value={a.id} /><input type="hidden" name="user_id" value={u.id} />
                    <Input name="ends_on" type="date" defaultValue={today} className="min-h-9 w-40" aria-label="終了日" />
                    <SubmitButton size="sm" variant="outline">終了</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          <form action={addAssignment} className="grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-4 sm:items-end">
            <input type="hidden" name="user_id" value={u.id} />
            <Field label="院"><Select name="store_id" required defaultValue="">{[<option key="" value="" disabled>選択</option>, ...(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)]}</Select></Field>
            <Field label="役職"><Select name="role" defaultValue="STAFF"><option value="STAFF">一般スタッフ</option><option value="MANAGER">院長</option><option value="PART_TIMER">アルバイト</option></Select></Field>
            <Field label="開始日"><Input name="starts_on" type="date" defaultValue={today} required /></Field>
            <label className="flex items-center gap-2 pb-2 text-sm font-bold"><input type="checkbox" name="is_primary" className="size-5" />主所属</label>
            <div className="sm:col-span-4"><SubmitButton variant="outline">所属を追加（兼務・異動）</SubmitButton></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>全社の役職（社長・GM・BM）</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid gap-2">
            {((groles ?? []) as unknown as GlobalRole[]).map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${current(r) ? "border-stone-200" : "border-dashed border-stone-200 text-stone-400"}`}>
                <Badge tone="brand">{r.roles ? ROLE_LABEL[r.roles.code] : "-"}{r.areas ? `（${r.areas.name}）` : ""}</Badge>
                <span className="text-xs">{formatDate(r.starts_on)}〜{r.ends_on ? formatDate(r.ends_on) : ""}</span>
                {r.ends_on === null ? (
                  <form action={endGlobalRole} className="ml-auto flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="user_id" value={u.id} />
                    <Input name="ends_on" type="date" defaultValue={today} className="min-h-9 w-40" aria-label="終了日" />
                    <SubmitButton size="sm" variant="outline">終了</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
            {(groles ?? []).length === 0 ? <li className="text-sm text-stone-500">なし</li> : null}
          </ul>
          <form action={addGlobalRole} className="grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-3 sm:items-end">
            <input type="hidden" name="user_id" value={u.id} />
            <Field label="役職"><Select name="role" defaultValue="GM"><option value="PRESIDENT">社長</option><option value="GM">GM</option><option value="BM">BM</option></Select></Field>
            <Field label="担当エリア（BMのみ）"><Select name="area_id" defaultValue=""><option value="">（なし）</option>{(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="開始日"><Input name="starts_on" type="date" defaultValue={today} required /></Field>
            <div className="sm:col-span-3"><SubmitButton variant="outline">役職を追加</SubmitButton></div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>PASS</CardTitle></CardHeader>
          <CardContent><ReissuePassword userId={u.id} disabled={u.status !== "active"} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>在籍</CardTitle></CardHeader>
          <CardContent>
            {isSelf ? <p className="text-sm text-stone-500">自分自身の在籍状態は変更できません。</p> : u.status === "retired" ? (
              <form action={setStatus} className="grid gap-2">
                <input type="hidden" name="id" value={u.id} /><input type="hidden" name="status" value="active" />
                <p className="text-sm text-stone-600">在籍に戻すと、再びログインできるようになります。</p>
                <div><SubmitButton variant="outline">在籍に戻す</SubmitButton></div>
              </form>
            ) : (
              <form action={setStatus} className="grid gap-2">
                <input type="hidden" name="id" value={u.id} /><input type="hidden" name="status" value="retired" />
                <p className="text-sm text-stone-600">退職にするとログインを停止します（POSにも入れなくなります）。記録は残ります。</p>
                <Field label="退職日"><Input name="retired_at" type="date" defaultValue={today} required /></Field>
                <div><SubmitButton variant="danger">退職にする</SubmitButton></div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
