"use client";
// マンダラの取り込み：ファイル選択 → 形式判定 →（一覧形式なら）列の対応付け → 差分プレビュー → 確定
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/common/use-action";
import { parseCSV } from "@/lib/io/csv";
import { LIST_FIELDS, diffImport, guessMapping, looksLikeGrid, parseGrid, parseList, type ImportMode, type ListMapping, type MandalaImportData } from "@/lib/io/mandala-io";
import type { AreaCode, MandalaAction, MandalaGoal } from "@/lib/types";
import { importMandala } from "../actions";
import type { BoardAction, BoardGoal } from "./board";

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  return String(v);
}

export function ImportDialog({ open, onOpenChange, goals, center, actions }: { open: boolean; onOpenChange: (o: boolean) => void; goals: BoardGoal[]; center: { id: string; title: string } | null; actions: BoardAction[] }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<"grid" | "list">("list");
  const [mapping, setMapping] = useState<ListMapping>({});
  const [mode, setMode] = useState<ImportMode>("fill");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState("");
  const { pending, exec } = useAction();

  const reset = () => {
    setRows(null);
    setFileName("");
    setError("");
    setMode("fill");
    setConfirmReplace(false);
  };

  async function onFile(f: File | undefined) {
    setError("");
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setError("ファイルが大きすぎます（5MBまで）");
    try {
      let data: string[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = await readSheet(f);
        data = sheet.map((r) => r.map(cellToString));
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const buf = await f.arrayBuffer();
        // UTF-8 で読めなければ Shift_JIS（Excel の既定 CSV）として読む
        let text = new TextDecoder("utf-8").decode(buf);
        if (text.includes("�")) text = new TextDecoder("shift_jis").decode(buf);
        data = parseCSV(text);
      } else {
        return setError("対応形式は .xlsx（Excel）と .csv です。古い .xls は Excel で .xlsx に保存し直してください");
      }
      if (!data.length) return setError("データが空です");
      setRows(data);
      setFileName(f.name);
      const grid = looksLikeGrid(data);
      setFormat(grid ? "grid" : "list");
      setMapping(guessMapping(data[0] ?? []));
    } catch (e) {
      setError(`ファイルを読み込めませんでした（${e instanceof Error ? e.message : ""}）`);
    }
  }

  const goalsForDiff: MandalaGoal[] = useMemo(
    () => [
      ...(center ? [{ id: center.id, user_id: "", position: 0, code: "CENTER" as const, title: center.title, description: "" }] : []),
      ...goals.map((g, i) => ({ id: g.id, user_id: "", position: i + 1, code: g.code, title: g.title, description: g.description })),
    ],
    [goals, center],
  );
  const areaTitles = useMemo(() => new Map<string, AreaCode>(goals.map((g) => [g.title, g.code])), [goals]);

  const parsed = useMemo((): { data: MandalaImportData | null; errors: string[] } => {
    if (!rows) return { data: null, errors: [] };
    try {
      if (format === "grid") return { data: parseGrid(rows), errors: [] };
      const missing = LIST_FIELDS.filter((f) => f.required && mapping[f.key] == null);
      if (missing.length) return { data: null, errors: [`必須の項目を対応付けてください：${missing.map((m) => m.label).join("、")}`] };
      return parseList(rows, mapping, areaTitles);
    } catch (e) {
      return { data: null, errors: [e instanceof Error ? e.message : "読み込めませんでした"] };
    }
  }, [rows, format, mapping, areaTitles]);

  const changes = useMemo(() => (parsed.data ? diffImport(goalsForDiff, actions as MandalaAction[], parsed.data, mode) : []), [parsed.data, goalsForDiff, actions, mode]);
  const applied = changes.filter((c) => c.applied);
  const header = rows?.[0] ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>マンダラを取り込む（Excel / CSV）</DialogTitle>
          <DialogDescription>9×9 のマンダラ形式、または1行1項目の一覧形式に対応。確定するまで保存されません。既定では今の内容を上書きしません。</DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3">
            <label className="hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-sm">
              <span className="font-semibold">ファイルを選択</span>
              <span className="text-muted-foreground text-xs">.xlsx（最初のシート）／ .csv（UTF-8 または Shift_JIS）</span>
              <input type="file" accept=".xlsx,.csv,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <div className="text-muted-foreground space-y-1 text-xs">
              <p>・9×9形式：中央のマスが中心目標、中央ブロックの周り8マス（または各ブロックの中央）が領域、残りが行動。配置は左上から右へ A〜H。</p>
              <p>・一覧形式：1行目に見出し（領域・番号・項目名・期限・KPI名称・目標値・単位 など）。領域名の行は番号を 0 にします。</p>
              <p>・「一覧CSV」で書き出したファイルはそのまま取り込めます。</p>
            </div>
            {error && <p className="text-status-red text-sm">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{fileName}</Badge>
              <span className="text-muted-foreground">{rows.length}行</span>
              <NativeSelect value={format} onChange={(e) => setFormat(e.target.value as "grid" | "list")} className="h-8 w-auto">
                <option value="grid">9×9 マンダラ形式</option>
                <option value="list">一覧形式（1行1項目）</option>
              </NativeSelect>
              <Button size="sm" variant="ghost" onClick={reset}>別のファイル</Button>
            </div>

            {format === "list" && (
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-xs font-semibold">項目の対応付け（ファイルの列 → FREEDOM OS の項目）</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LIST_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-xs">
                      <span className="w-36 shrink-0">{f.label}{f.required && <span className="text-status-red">*</span>}</span>
                      <NativeSelect
                        className="h-8"
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) })}
                      >
                        <option value="">（使わない）</option>
                        {header.map((h, i) => <option key={i} value={i}>{`${i + 1}列目：${h || "（空）"}`}</option>)}
                      </NativeSelect>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {parsed.errors.length > 0 && (
              <ul className="bg-status-amber/10 text-status-amber max-h-28 overflow-y-auto rounded-md p-2 text-xs">
                {parsed.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}

            {parsed.data && (
              <>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold">読み取り結果</div>
                  <div className="text-muted-foreground text-xs">中心：{parsed.data.center || "（なし）"}</div>
                  <div className="text-muted-foreground text-xs">
                    {parsed.data.areas.map((a) => `${a.code}「${a.title || "—"}」${a.actions.length}件`).join("／") || "領域なし"}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" checked={mode === "fill"} onChange={() => setMode("fill")} /> 空欄だけ補完（既存の内容は変更しない）</label>
                    <label className="flex items-center gap-2"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> 取り込み内容で置き換える</label>
                  </div>
                  {mode === "replace" && (
                    <label className="text-status-red flex items-center gap-2 text-xs">
                      <Checkbox checked={confirmReplace} onCheckedChange={(v) => setConfirmReplace(!!v)} />
                      既存の内容を置き換えることを確認しました（変更前の値は監査ログに残ります）
                    </label>
                  )}
                </div>
                <div className="max-h-[35vh] overflow-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr><th className="p-2 text-left">対象</th><th className="text-left">項目</th><th className="text-left">現在</th><th className="text-left">取り込み後</th><th className="p-2 text-left">反映</th></tr>
                    </thead>
                    <tbody>
                      {changes.length === 0 ? (
                        <tr><td colSpan={5} className="text-muted-foreground p-3 text-center">変更点はありません</td></tr>
                      ) : (
                        changes.map((c, i) => (
                          <tr key={i} className="border-t align-top">
                            <td className="p-2 font-semibold">{c.target}</td>
                            <td className="py-2">{c.field}</td>
                            <td className="text-muted-foreground max-w-40 py-2">{c.before || "（空）"}</td>
                            <td className="max-w-40 py-2">{c.after}</td>
                            <td className="p-2">{c.applied ? <Badge variant="green">反映</Badge> : <Badge variant="gray">既存を維持</Badge>}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
              <Button
                disabled={pending || !parsed.data || applied.length === 0 || (mode === "replace" && !confirmReplace)}
                onClick={() =>
                  parsed.data &&
                  exec(() => importMandala(parsed.data!, mode), {
                    onOk: () => {
                      reset();
                      onOpenChange(false);
                    },
                  })
                }
              >
                {pending ? "取り込み中…" : `${applied.length}件を反映する`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
