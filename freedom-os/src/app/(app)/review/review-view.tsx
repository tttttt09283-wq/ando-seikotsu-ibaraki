"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Empty } from "@/components/common/parts";
import { Field } from "@/components/common/field";
import { useAction } from "@/components/common/use-action";
import { addDays } from "@/lib/date";
import type { ReviewComparison } from "@/lib/domain/review";
import { dateJa, pct, signedYen, yen } from "@/lib/format";
import { WeeklyReviewSchema, type WeeklyReviewInput } from "@/lib/schemas";
import type { WeeklyReview } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteWeeklyReview, saveWeeklyReview } from "../actions";

const NUM_FIELDS: { k: keyof WeeklyReviewInput; label: string; unit: string }[] = [
  { k: "clinic_revenue", label: "今週の施術売上", unit: "円" },
  { k: "ai_revenue", label: "AI売上", unit: "円" },
  { k: "new_customers", label: "新規顧客", unit: "人" },
  { k: "returning_customers", label: "継続顧客", unit: "人" },
  { k: "ai_contracts", label: "AI契約数", unit: "社" },
  { k: "tasks_done", label: "タスク達成数", unit: "件" },
  { k: "work_hours", label: "労働時間（事業）", unit: "時間" },
  { k: "family_hours", label: "家族時間", unit: "時間" },
];

const signed = (v: number | null, unit: string) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}${unit}`);

export function ReviewView({
  week,
  thisWeek,
  existing,
  autoTasksDone,
  latestContracts,
  history,
  targets,
}: {
  week: string;
  thisWeek: string;
  existing: WeeklyReview | null;
  autoTasksDone: number;
  latestContracts: number | null;
  history: ReviewComparison[];
  targets: { revenueWeekly: number; family: number; maxWork: number };
}) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const form = useForm<WeeklyReviewInput>({
    resolver: zodResolver(WeeklyReviewSchema),
    defaultValues: existing
      ? { ...existing }
      : { week_start: week, clinic_revenue: 0, ai_revenue: 0, new_customers: 0, returning_customers: 0, ai_contracts: latestContracts ?? 0, tasks_done: autoTasksDone, work_hours: 0, family_hours: 0, wins: "", issues: "", next_focus: "" },
  });
  const { register, handleSubmit, formState, setValue } = form;
  const go = (w: string) => router.push(`/review?week=${w}`);
  const err = (k: keyof WeeklyReviewInput) => formState.errors[k]?.message as string | undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => go(addDays(week, -7))} aria-label="前の週"><ChevronLeft /></Button>
            <CardTitle className="flex-1 text-center text-base">{dateJa(week)} 〜 {dateJa(addDays(week, 6))}</CardTitle>
            <Button variant="outline" size="icon" onClick={() => go(addDays(week, 7))} aria-label="次の週"><ChevronRight /></Button>
          </div>
          <CardDescription className="text-center">
            {existing ? "保存済み（上書き保存できます）" : "未記入"}
            {week !== thisWeek && <button className="text-primary ml-2" onClick={() => go(thisWeek)}>今週へ</button>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit((v) => exec(() => saveWeeklyReview(v)))}>
            <input type="hidden" {...register("week_start")} />
            <div className="grid grid-cols-2 gap-3">
              {NUM_FIELDS.map((f) => (
                <Field key={f.k} label={`${f.label}（${f.unit}）`} htmlFor={f.k} error={err(f.k)}>
                  <Input id={f.k} inputMode="decimal" className="num text-right" {...register(f.k)} />
                </Field>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setValue("tasks_done", autoTasksDone)}>タスク達成数を自動集計（{autoTasksDone}件）</Button>
            <Field label="今週できたこと" htmlFor="wins"><Textarea id="wins" rows={3} {...register("wins")} /></Field>
            <Field label="今週の課題" htmlFor="issues"><Textarea id="issues" rows={3} {...register("issues")} /></Field>
            <Field label="来週の重点" htmlFor="next_focus"><Textarea id="next_focus" rows={2} {...register("next_focus")} /></Field>
            <p className="text-muted-foreground text-xs">※ 患者様の氏名・症状などの個人情報は書かないでください（AI分析に送る場合があります）。</p>
            <div className="flex justify-between gap-2">
              {existing ? <Button type="button" variant="ghost" className="text-status-red" onClick={() => confirm("この週のレビューを削除しますか？") && exec(() => deleteWeeklyReview(existing.id))}><Trash />削除</Button> : <span />}
              <Button type="submit" disabled={pending}>{pending ? "保存中…" : "レビューを保存"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold">履歴と比較</h2>
        {history.length === 0 ? (
          <Empty>まだレビューがありません。</Empty>
        ) : (
          history.map((h) => (
            <Card key={h.review.id} className={cn("cursor-pointer gap-2 py-4", h.review.week_start === week && "border-primary")} onClick={() => go(h.review.week_start)}>
              <CardContent className="space-y-2 px-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{dateJa(h.review.week_start)} の週</span>
                  <span className="num font-bold">{yen(h.revenue)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-muted-foreground">先週比</div>
                    <div className="num">{signedYen(h.prevWeek.revenue)}</div>
                    <div className="num text-muted-foreground">新規 {signed(h.prevWeek.newCustomers, "人")}・家族 {signed(h.prevWeek.family, "h")}</div>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-muted-foreground">先月比（4週合計）</div>
                    <div className="num">{yen(h.month.revenue4w)}</div>
                    <div className="num text-muted-foreground">{h.month.prevRevenue4w == null ? "比較データなし" : `前4週 ${signedYen(h.month.revenue4w - h.month.prevRevenue4w)}`}</div>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-muted-foreground">目標比</div>
                    <div className="num">売上 {pct(h.target.revenueRatio)}</div>
                    <div className="num text-muted-foreground">家族 {pct(h.target.familyRatio)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="secondary">労働 {h.review.work_hours}h</Badge>
                  {h.target.workOver && <Badge variant="red">上限 {targets.maxWork}h 超過</Badge>}
                  <Badge variant={h.review.family_hours >= targets.family ? "green" : "amber"}>家族 {h.review.family_hours}h</Badge>
                  <Badge variant="secondary">タスク {h.review.tasks_done}件</Badge>
                </div>
                {h.review.issues && <p className="text-muted-foreground line-clamp-2 text-xs">課題：{h.review.issues}</p>}
              </CardContent>
            </Card>
          ))
        )}
        <p className="text-muted-foreground text-xs">週の売上目標の目安：{yen(targets.revenueWeekly)}（月商目標 ÷ 4.33週）</p>
      </div>
    </div>
  );
}
