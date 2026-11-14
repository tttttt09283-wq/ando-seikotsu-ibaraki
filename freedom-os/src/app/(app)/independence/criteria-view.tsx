"use client";
import Link from "next/link";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { CriterionBadge } from "@/components/common/parts";
import { Field } from "@/components/common/field";
import { useAction } from "@/components/common/use-action";
import type { CriterionResult } from "@/lib/domain/criteria";
import { cn } from "@/lib/utils";
import { saveCriterion } from "../actions";

type Item = CriterionResult & { threshold: number | null; threshold2: number | null; manualConfirmed: boolean; note: string; thresholdLabel: string | null; threshold2Label: string | null };
const BASIS = { actual: "実績で判定", simulation: "試算で判定", manual: "準備状況で判定", mixed: "実績＋試算" } as const;

export function CriteriaView({ items, readiness, settings }: { items: Item[]; readiness: { achieved: number; total: number; rate: number }; settings: { emergencyMin: number; emergencyTarget: number; maxHours: number } }) {
  const [edit, setEdit] = useState<Item | null>(null);
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">独立準備達成率（参考指標）</div>
              <div className="num text-4xl font-bold">{readiness.achieved}<span className="text-muted-foreground text-lg"> / {readiness.total} 条件</span></div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(["achieved", "not_achieved", "needs_review", "insufficient"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1"><CriterionBadge status={s} /> {items.filter((i) => i.enabled && i.status === s).length}</span>
              ))}
            </div>
          </div>
          <Progress value={readiness.rate * 100} />
          <p className="text-muted-foreground text-xs leading-relaxed">
            これは条件の達成状況を見える化した参考指標で、独立の成功確率ではありません。すべての条件を満たしても、このシステムが退職を推奨することはありません。
            最終的な判断は、ご家族と話し合い、必要に応じて税理士・社労士などの専門家に確認したうえで、ご自身で行ってください。
          </p>
        </CardContent>
      </Card>

      <ol className="space-y-3">
        {items.map((c, i) => (
          <li key={c.code}>
            <Card className={cn(!c.enabled && "opacity-60")}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-xs">条件 {i + 1}・{BASIS[c.basis]}{!c.enabled && "・判定対象外"}</div>
                    <h2 className="font-semibold">{c.title}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <CriterionBadge status={c.status} />
                    <Button size="sm" variant="ghost" onClick={() => setEdit(c)} aria-label={`${c.title}の基準を編集`}><Pencil /></Button>
                  </div>
                </div>
                <p className="text-sm font-medium">{c.summary}</p>
                {c.details.length > 0 && <ul className="text-muted-foreground space-y-0.5 text-xs">{c.details.map((d, k) => <li key={k}>{d}</li>)}</ul>}
                <p className="text-muted-foreground text-[11px]">{c.description}</p>
                {c.note && <p className="bg-muted rounded p-2 text-xs">メモ：{c.note}</p>}
                {c.status === "insufficient" && <Link href="/actuals" className="text-primary text-xs">→ 月次実績を入力する</Link>}
                {c.code === "preparation" && <Link href="/mandala" className="text-primary ml-3 text-xs">→ マンダラの F（独立準備）を見る</Link>}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">生活防衛資金の月数（{settings.emergencyMin}〜{settings.emergencyTarget}か月）と労働時間の上限（週{settings.maxHours}時間）は<Link href="/settings" className="text-primary">設定画面</Link>で変更できます。</p>

      {edit && <EditDialog item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const [enabled, setEnabled] = useState(item.enabled);
  const [t1, setT1] = useState(item.threshold == null ? "" : String(item.threshold));
  const [t2, setT2] = useState(item.threshold2 == null ? "" : String(item.threshold2));
  const [confirmed, setConfirmed] = useState(item.manualConfirmed);
  const [note, setNote] = useState(item.note);
  const { pending, exec } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />この条件を判定に含める</label>
        {item.thresholdLabel && <Field label={item.thresholdLabel} htmlFor="t1"><Input id="t1" inputMode="decimal" value={t1} onChange={(e) => setT1(e.target.value)} /></Field>}
        {item.threshold2Label && <Field label={item.threshold2Label} htmlFor="t2"><Input id="t2" inputMode="decimal" value={t2} onChange={(e) => setT2(e.target.value)} /></Field>}
        {item.code === "preparation" && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} className="mt-0.5" />
            <span>税理士・保健所など専門家への確認が済んでいる<Badge variant="outline" className="ml-1">手動確認</Badge></span>
          </label>
        )}
        <Field label="メモ" htmlFor="note"><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button disabled={pending} onClick={() => exec(() => saveCriterion(item.code, { enabled, threshold: t1, threshold2: t2, manual_confirmed: confirmed, note }), { onOk: onClose })}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
