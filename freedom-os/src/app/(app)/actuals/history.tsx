"use client";
import Link from "next/link";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/common/parts";
import { useAction } from "@/components/common/use-action";
import { parseCSV } from "@/lib/io/csv";
import { parseActualsCsv } from "@/lib/io/export";
import { monthJa, yen } from "@/lib/format";
import { importActualsAction } from "../actions";

export interface HistoryRow {
  month: string;
  clinic: number;
  ai: number;
  expenses: number;
  profit: number;
  sessions: number | null;
  active: number | null;
  contracts: number | null;
  fund: number | null;
}

export function ActualsHistory({ rows }: { rows: HistoryRow[] }) {
  const { pending, exec } = useAction();
  const [msg, setMsg] = useState<string[]>([]);
  async function onFile(f?: File) {
    if (!f) return;
    const buf = await f.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("shift_jis").decode(buf);
    const { months, errors } = parseActualsCsv(parseCSV(text));
    setMsg(errors);
    if (!months.length) return;
    if (confirm(`${months.length}か月分を取り込みます。同じ月の値は上書きされ、CSVで空欄の項目は「未入力」になります。よろしいですか？`)) exec(() => importActualsAction(months));
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>入力済みの月</CardTitle>
        <CardDescription>月をクリックすると編集できます</CardDescription>
        <CardAction className="flex gap-2">
          <Button size="sm" variant="outline" asChild><a href="/api/export?type=actuals"><Download />CSV</a></Button>
          <Button size="sm" variant="outline" asChild disabled={pending}>
            <label className="cursor-pointer"><Upload />取り込み<input type="file" accept=".csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {msg.length > 0 && <ul className="text-status-amber mb-2 text-xs">{msg.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        {rows.length === 0 ? (
          <Empty>まだ実績がありません。上のフォームで今月の数字を入力しましょう。</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[680px] text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr className="text-right"><th className="py-2 text-left">月</th><th>施術売上</th><th>AI売上</th><th>経費</th><th>事業利益</th><th>施術件数</th><th>継続患者</th><th>AI契約</th><th>防衛資金</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-t text-right">
                    <td className="py-2 text-left"><Link className="text-primary" href={`/actuals?month=${r.month.slice(0, 7)}`}>{monthJa(r.month)}</Link></td>
                    <td>{yen(r.clinic)}</td>
                    <td>{yen(r.ai)}</td>
                    <td>{yen(r.expenses)}</td>
                    <td className={r.profit < 0 ? "text-status-red" : ""}>{yen(r.profit)}</td>
                    <td>{r.sessions ?? "—"}</td>
                    <td>{r.active ?? "—"}</td>
                    <td>{r.contracts ?? "—"}</td>
                    <td>{yen(r.fund)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
