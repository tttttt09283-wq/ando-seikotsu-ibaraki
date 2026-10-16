"use client";

import { CircleAlert, CircleCheck, FileUp, LoaderCircle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatOku } from "./RevenuePanel";
import { useCompany } from "./StateProvider";

export type Msg = { ok: boolean; text: string } | null;

export function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("flex items-start gap-1.5 text-xs", msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
      {msg.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden /> : <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
      {msg.text}
    </p>
  );
}

export async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Excel で保存した CSV は Shift_JIS のことが多い
    return new TextDecoder("shift_jis").decode(buf);
  }
}

export type SourceValue = { mode: "file"; file: File | null } | { mode: "url"; url: string };

/** 取り込み元：CSVファイル または GoogleスプレッドシートのURL */
export function SourcePicker({ value, onChange, disabled, idPrefix }: { value: SourceValue; onChange: (v: SourceValue) => void; disabled?: boolean; idPrefix: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (value.mode === "file" && !value.file && inputRef.current) inputRef.current.value = "";
  }, [value]);
  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="group" aria-label="取り込み元">
        {(
          [
            ["url", "スプレッドシートのURL"],
            ["file", "CSVファイル"],
          ] as const
        ).map(([m, l]) => (
          <button
            key={m}
            type="button"
            aria-pressed={value.mode === m}
            onClick={() => onChange(m === "file" ? { mode: "file", file: null } : { mode: "url", url: "" })}
            className={cn("rounded-full px-3 py-1 text-xs", value.mode === m ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
          >
            {l}
          </button>
        ))}
      </div>
      {value.mode === "url" ? (
        <label className="block text-xs" htmlFor={`${idPrefix}-url`}>
          読み込むタブを開いた状態のURL
          <input
            id={`${idPrefix}-url`}
            type="url"
            inputMode="url"
            value={value.url}
            disabled={disabled}
            onChange={(e) => onChange({ mode: "url", url: e.target.value })}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…"
            className="focus-visible:ring-ring/50 mt-1 block h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
          />
          <span className="text-muted-foreground mt-1 block">
            タブごとに URL の最後（#gid=…）が変わります。読みたいタブを開いてからURLをコピーしてください。
          </span>
        </label>
      ) : (
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSVファイル"
          disabled={disabled}
          onChange={(e) => onChange({ mode: "file", file: e.target.files?.[0] ?? null })}
          className="file:bg-secondary max-w-full text-xs file:mr-2 file:rounded-md file:border-0 file:px-2 file:py-1"
        />
      )}
    </div>
  );
}

export async function sourceBody(v: SourceValue): Promise<{ csv?: string; url?: string; fileName?: string } | null> {
  if (v.mode === "url") return v.url.trim() ? { url: v.url.trim() } : null;
  if (!v.file) return null;
  return { csv: await readFileText(v.file), fileName: v.file.name };
}

export const sourceReady = (v: SourceValue) => (v.mode === "url" ? v.url.trim().length > 10 : Boolean(v.file));

type YearGridResult = {
  kind: "year_grid";
  unit: string;
  budget: { cells: number; total: number; staffCells: number; companyTotal: number | null };
  actuals: { cells: number; previousYear: number };
  futureYears: { fyStart: string; term: string; clinics: number; total: number }[];
  scenarioName: string | null;
  growthRate: number | null;
  unmatched: string[];
  warnings: string[];
};
type SimpleResult = { kind: "simple"; clinics: string[]; cells: number; total: number; annualOnly: boolean; unit: string; unmatched: string[]; warnings: string[] };

/**
 * 年間予算表・進捗表・院×月の予算表の取り込み。
 * 年度（R8.7~R9.6）や「予算」「実績」「昨対」の行がある表は、今期→予算の案、来期以降→中期計画、実績→院の売上に入れる。
 */
export function PlanSheetImport({ disabled, onDone, scenarioId }: { disabled?: boolean; onDone?: () => void; scenarioId?: string }) {
  const { mutate } = useCompany();
  const [src, setSrc] = React.useState<SourceValue>({ mode: "url", url: "" });
  const [unit, setUnit] = React.useState<"auto" | "yen" | "thousand" | "man">("auto");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [result, setResult] = React.useState<YearGridResult | SimpleResult | null>(null);

  const run = async () => {
    const body = await sourceBody(src);
    if (!body) return;
    setBusy(true);
    setMsg(null);
    setResult(null);
    const r = await mutate("/api/budget", { action: "import", unit, scenarioId, ...body });
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setResult(r.data.result as YearGridResult | SimpleResult);
    setMsg({ ok: true, text: "取り込みました。予算は「案」に入ったので、確認してから確定の承認依頼をしてください。" });
    if (src.mode === "file") setSrc({ mode: "file", file: null });
    onDone?.();
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div>
        <p className="text-sm font-medium">年間予算表・進捗表を取り込む</p>
        <p className="text-muted-foreground text-xs">
          「R8.7~R9.6」のような年度や「予算」「実績」「昨対」の行がある表は、<strong>今期の予算 → 予算の案</strong>（人員の行があれば人員も）、
          <strong>来期以降（新案）→ 中期計画</strong>、<strong>実績・昨年の売上 → 院の売上の実績</strong>に入れます。院×月だけの予算表・年間予算だけの表も読めます。
        </p>
      </div>
      <SourcePicker value={src} onChange={setSrc} disabled={disabled || busy} idPrefix="plan-import" />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          金額の単位
          <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="bg-background mt-1 block h-8 rounded-md border px-2 text-sm">
            <option value="auto">自動で判断</option>
            <option value="yen">円</option>
            <option value="thousand">千円</option>
            <option value="man">万円</option>
          </select>
        </label>
        <Button size="sm" variant="outline" disabled={disabled || busy || !sourceReady(src)} onClick={run}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileUp aria-hidden />} 取り込む
        </Button>
      </div>
      <Message msg={msg} />
      {result?.kind === "year_grid" && (
        <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
          <li>
            今期の予算：{result.budget.cells ? `${result.budget.cells}件・合計 ${formatOku(result.budget.total)}（予算の案に入れました）` : "なし"}
            {result.budget.staffCells > 0 && `・人員 ${result.budget.staffCells}件`}
            {result.budget.companyTotal != null && `（表の全体の予算 ${formatOku(result.budget.companyTotal)}）`}
          </li>
          <li>
            実績：{result.actuals.cells}件（うち前年度 {result.actuals.previousYear}件）
          </li>
          {result.futureYears.map((y) => (
            <li key={y.fyStart}>
              {y.term}の計画：{y.clinics}院・合計 {formatOku(y.total)}（中期計画「{result.scenarioName}」に入れました）
            </li>
          ))}
          {result.growthRate != null && <li>既存店成長率：{Math.round(result.growthRate * 1000) / 10}%</li>}
          <li>単位：{result.unit}として読み取り</li>
          {result.unmatched.length > 0 && (
            <li className="text-amber-700 dark:text-amber-400">院が分からない行：{result.unmatched.join("、")}（新しい院なら「院の設定」で追加してから取り込み直してください）</li>
          )}
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {result?.kind === "simple" && (
        <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
          <li>
            {result.clinics.length}院・{result.cells}件、合計 {formatOku(result.total)}（単位：{result.unit}として読み取り）
            {result.annualOnly && "・年間予算を月に均等割り"}
          </li>
          {result.unmatched.length > 0 && (
            <li className="text-amber-700 dark:text-amber-400">院が分からない行：{result.unmatched.join("、")}（新しい院なら「院の設定」で追加してから取り込み直してください）</li>
          )}
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
