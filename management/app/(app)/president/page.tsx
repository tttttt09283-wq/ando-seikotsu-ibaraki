import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/server/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhaseNote } from "@/components/phase-note";

export const metadata: Metadata = { title: "社長ダッシュボード" };

export default async function PresidentPage() {
  if (!(await can("dashboard.president"))) notFound();
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">社長ダッシュボード</h1>
      <PhaseNote phase="PHASE 4〜9">有給・アルバイト勤務・振休変更・社内規定の承認待ちをここにまとめて表示し、この画面から承認・差戻し・却下できるようにします。</PhaseNote>
      <Card>
        <CardHeader><CardTitle>管理（PHASE 2）</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild><Link href="/admin/users">スタッフ・ID/PASSの管理</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/stores">店舗・エリアの管理</Link></Button>
        </CardContent>
      </Card>
    </>
  );
}
