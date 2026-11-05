import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { saveStore, saveArea } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export const metadata: Metadata = { title: "店舗・エリア" };

type Store = { id: string; code: string; name: string; area_id: string | null; display_order: number; is_active: boolean; opened_on: string | null; pos_store_id: number | null };
type Area = { id: string; name: string; display_order: number };

function StoreForm({ store, areas }: { store?: Store; areas: Area[] }) {
  return (
    <form action={saveStore} className="grid gap-3 sm:grid-cols-2">
      {store ? <input type="hidden" name="id" value={store.id} /> : null}
      <Field label="店舗コード" hint={store ? "作成後は変更できません" : "半角英大文字（例：KORIEN）"}>
        {store ? <Input name="code" value={store.code} readOnly className="font-mono" /> : <Input name="code" required className="font-mono" placeholder="KORIEN" />}
      </Field>
      <Field label="店舗名"><Input name="name" defaultValue={store?.name} required maxLength={40} /></Field>
      <Field label="エリア">
        <Select name="area_id" defaultValue={store?.area_id ?? ""}>
          <option value="">（未設定）</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <Field label="表示順"><Input name="display_order" type="number" min={0} max={999} defaultValue={store?.display_order ?? 0} /></Field>
      <Field label="開院日"><Input name="opened_on" type="date" defaultValue={store?.opened_on ?? ""} /></Field>
      <Field label="POSの店舗番号" hint="POSに登録のある院だけ（現在：香里園駅前院・茨木院）"><Input name="pos_store_id" type="number" min={1} defaultValue={store?.pos_store_id ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="is_active" defaultChecked={store?.is_active ?? true} className="size-5" />運用中</label>
      <div className="sm:col-span-2"><SubmitButton>{store ? "保存" : "店舗を追加"}</SubmitButton></div>
    </form>
  );
}

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await can("master.manage"))) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: stores }, { data: areas }] = await Promise.all([
    supabase.from("stores").select("*").order("display_order"),
    supabase.from("areas").select("*").order("display_order"),
  ]);
  const areaList = (areas ?? []) as Area[];
  const areaName = (id: string | null) => areaList.find((a) => a.id === id)?.name;
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">店舗・エリア</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <Card>
        <CardHeader><CardTitle>店舗（{stores?.length ?? 0}院）</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {((stores ?? []) as Store[]).map((s) => (
            <details key={s.id} className="rounded-lg border border-stone-200 open:border-brand-600">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="font-bold">{s.name}</span>
                <span className="font-mono text-xs text-stone-500">{s.code}</span>
                {areaName(s.area_id) ? <Badge>{areaName(s.area_id)}</Badge> : <Badge tone="warn">エリア未設定</Badge>}
                {s.pos_store_id ? <Badge tone="ok">POS連携 #{s.pos_store_id}</Badge> : null}
                {s.is_active ? null : <Badge tone="danger">休止中</Badge>}
              </summary>
              <div className="border-t border-stone-100 p-3"><StoreForm store={s} areas={areaList} /></div>
            </details>
          ))}
          <details className="rounded-lg border border-dashed border-stone-300">
            <summary className="cursor-pointer px-3 py-2.5 font-bold text-brand-700">＋ 店舗を追加</summary>
            <div className="border-t border-stone-100 p-3"><StoreForm areas={areaList} /></div>
          </details>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>エリア（BMの担当範囲）</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {areaList.length === 0 ? <p className="text-sm text-stone-500">まだありません。エリアの区切りとBMの担当は未確定です（Q-14）。</p> : null}
          {areaList.map((a) => (
            <form key={a.id} action={saveArea} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={a.id} />
              <div className="grow"><Field label="エリア名"><Input name="name" defaultValue={a.name} required maxLength={40} /></Field></div>
              <div className="w-24"><Field label="表示順"><Input name="display_order" type="number" min={0} defaultValue={a.display_order} /></Field></div>
              <SubmitButton variant="outline">保存</SubmitButton>
            </form>
          ))}
          <form action={saveArea} className="flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
            <div className="grow"><Field label="新しいエリア"><Input name="name" required maxLength={40} placeholder="例：北エリア" /></Field></div>
            <input type="hidden" name="display_order" value={areaList.length + 1} />
            <SubmitButton variant="outline">エリアを追加</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
