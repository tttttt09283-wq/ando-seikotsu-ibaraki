import type { Metadata } from "next";
import Link from "next/link";
import { requireMe } from "@/server/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RoleList } from "@/components/role-list";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "マイページ" };

export default async function MyPage({ searchParams }: { searchParams: Promise<{ pw?: string }> }) {
  const me = await requireMe();
  const { pw } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">マイページ</h1>
      {pw === "changed" ? <Alert tone="ok">PASSを変更しました。</Alert> : null}
      <Card>
        <CardHeader><CardTitle>{me.name} さん</CardTitle><Button asChild size="sm" variant="outline"><Link href="/account/password">PASSを変更</Link></Button></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-stone-500">ログインID</dt><dd className="font-mono">{me.login_id}</dd>
            <dt className="text-stone-500">スタッフID</dt><dd className="font-mono">{me.staff_code}</dd>
          </dl>
          <div><p className="mb-1.5 text-stone-500">役職・所属</p><RoleList me={me} /></div>
        </CardContent>
      </Card>
      <PhaseNote phase="PHASE 3〜4">有給・振休（振替・祝振替）の残数、取得予定、申請と承認の状況をここに表示します。</PhaseNote>
    </>
  );
}
