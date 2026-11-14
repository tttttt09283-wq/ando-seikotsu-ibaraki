"use client";
import { useState } from "react";
import { Flag, Pencil, Plus, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { SourceTag } from "@/components/common/parts";
import { useAction } from "@/components/common/use-action";
import { KPI_SOURCES } from "@/lib/domain/mandala";
import { AREA_CODES } from "@/lib/types";
import { dateJa, num, yen } from "@/lib/format";
import { deleteMilestone, saveMilestone } from "../actions";
import type { GanttMilestone } from "./gantt";

const STATUS = { planned: "予定", achieved: "達成", missed: "未達" } as const;

export function MilestoneList({ milestones }: { milestones: GanttMilestone[] }) {
  const [edit, setEdit] = useState<GanttMilestone | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>マイルストーン</CardTitle>
        <CardDescription>日付・金額はすべて編集できます。指標を選ぶと現在の実績と比較できます</CardDescription>
        <CardAction><Button size="sm" onClick={() => setEdit("new")}><Plus />追加</Button></CardAction>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3 border-l pl-5">
          {milestones.map((m) => {
            const isYen = KPI_SOURCES.find((s) => s.key === m.metric)?.unit === "円";
            const fmt = (v: number | null) => (isYen ? yen(v) : num(v));
            return (
              <li key={m.id} className="relative">
                <span className={`absolute top-1.5 -left-[27px] size-3 rotate-45 ${m.status === "achieved" ? "bg-status-green" : m.status === "missed" ? "bg-status-red" : "bg-primary"}`} />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-xs">{dateJa(m.target_date)}{m.area_code && ` ・領域 ${m.area_code}`}</div>
                    <div className="font-semibold">{m.title}</div>
                    {m.description && <div className="text-muted-foreground text-sm">{m.description}</div>}
                    {m.metric !== "none" && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{m.metricLabel}</span>
                        {m.target_amount != null && <span className="flex items-center gap-1"><SourceTag kind="target" />{fmt(m.target_amount)}</span>}
                        <span className="flex items-center gap-1"><SourceTag kind="actual" />{fmt(m.current)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={m.status === "achieved" ? "green" : m.status === "missed" ? "red" : "blue"}>{STATUS[m.status]}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(m)} aria-label={`${m.title}を編集`}><Pencil /></Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
      {edit && <MilestoneDialog m={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function MilestoneDialog({ m, onClose }: { m: GanttMilestone | null; onClose: () => void }) {
  const [v, setV] = useState({
    title: m?.title ?? "",
    description: m?.description ?? "",
    target_date: m?.target_date ?? "",
    target_amount: m?.target_amount == null ? "" : String(m.target_amount),
    metric: m?.metric ?? "none",
    area_code: m?.area_code ?? "",
    status: m?.status ?? "planned",
  });
  const { pending, exec } = useAction();
  const set = (k: keyof typeof v, val: string) => setV({ ...v, [k]: val });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Flag className="size-4" />{m ? "マイルストーンを編集" : "マイルストーンを追加"}</DialogTitle></DialogHeader>
        <Field label="名称" htmlFor="ms-title"><Input id="ms-title" value={v.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="説明" htmlFor="ms-desc"><Textarea id="ms-desc" value={v.description} onChange={(e) => set("description", e.target.value)} rows={2} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付" htmlFor="ms-date"><Input id="ms-date" type="date" value={v.target_date} onChange={(e) => set("target_date", e.target.value)} /></Field>
          <Field label="状態" htmlFor="ms-status">
            <NativeSelect id="ms-status" value={v.status} onChange={(e) => set("status", e.target.value)}>
              <option value="planned">予定</option><option value="achieved">達成</option><option value="missed">未達</option>
            </NativeSelect>
          </Field>
          <Field label="比較する指標" htmlFor="ms-metric">
            <NativeSelect id="ms-metric" value={v.metric} onChange={(e) => set("metric", e.target.value)}>
              <option value="none">（なし）</option>
              {KPI_SOURCES.filter((s) => s.key !== "manual").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="目標値（金額は円）" htmlFor="ms-amount"><Input id="ms-amount" inputMode="numeric" value={v.target_amount} onChange={(e) => set("target_amount", e.target.value)} /></Field>
          <Field label="関連する領域" htmlFor="ms-area">
            <NativeSelect id="ms-area" value={v.area_code} onChange={(e) => set("area_code", e.target.value)}>
              <option value="">（なし）</option>
              {AREA_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {m ? <Button variant="ghost" className="text-status-red" disabled={pending} onClick={() => confirm("削除しますか？") && exec(() => deleteMilestone(m.id), { onOk: onClose })}><Trash />削除</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>キャンセル</Button>
            <Button disabled={pending} onClick={() => exec(() => saveMilestone(m?.id ?? null, v), { onOk: onClose })}>保存</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
