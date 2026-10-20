"use client";

import { useState, useTransition } from "react";
import { Badge, Table, Td } from "@/components/ui";
import { commitHolidayFile, previewHolidayFile, type HolidayPreviewResult } from "./actions";

const MAX_FILES = 300;

interface Row {
  preview: HolidayPreviewResult;
  include: boolean;
  applyBase: boolean;
  migrateCredit: boolean;
  result: { ok: boolean; message: string } | null;
}

/** zip（Google ドライブでフォルダごとダウンロードしたもの）は端末内で展開し、Excel を1つずつ送る */
async function expandFiles(list: FileList): Promise<File[]> {
  const out: File[] = [];
  for (const file of Array.from(list)) {
    if (/\.zip$/i.test(file.name)) {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      for (const entry of Object.values(zip.files)) {
        const base = entry.name.split("/").pop() ?? "";
        if (entry.dir || entry.name.startsWith("__MACOSX") || base.startsWith("~$") || !/\.(xlsx|xlsm)$/i.test(base)) continue;
        out.push(new File([await entry.async("blob")], base));
      }
    } else if (/\.(xlsx|xlsm)$/i.test(file.name) && !file.name.startsWith("~$")) {
      out.push(file);
    }
  }
  return out;
}

const addMonth = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
};

export function HolidayImportForm({ today }: { today: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(today);
  const [expiration, setExpiration] = useState(addMonth(today));
  const [pending, startTransition] = useTransition();

  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    startTransition(async () => {
      let files: File[];
      try {
        files = await expandFiles(list);
      } catch {
        setError("zip ファイルを展開できませんでした");
        return;
      }
      if (files.length === 0) return setError("Excel（.xlsx）ファイルが見つかりません");
      if (files.length > MAX_FILES) return setError(`一度に読み込めるのは${MAX_FILES}ファイルまでです`);
      const next: Row[] = [];
      for (const [i, file] of files.entries()) {
        setProgress(`読み込み中… ${i + 1} / ${files.length}`);
        const fd = new FormData();
        fd.set("file", file);
        const preview = await previewHolidayFile(fd);
        const usable = preview.ok && preview.staff !== null && !preview.issues.some((x) => x.level === "error");
        next.push({
          preview,
          include: usable,
          applyBase: usable && preview.ok && Boolean(preview.firstBaseDate) && !preview.baseDateIssue,
          migrateCredit: usable && preview.ok && (preview.creditRemaining ?? 0) > 0 && (preview.currentCredit ?? 0) === 0,
          result: null,
        });
      }
      setProgress(null);
      setRows(next);
    });
  };

  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const commit = () =>
    startTransition(async () => {
      const targets = rows.map((r, i) => [r, i] as const).filter(([r]) => r.include && r.preview.ok && r.preview.staff);
      for (const [n, [r, i]] of targets.entries()) {
        if (!r.preview.ok || !r.preview.staff) continue;
        setProgress(`取り込み中… ${n + 1} / ${targets.length}`);
        const p = r.preview;
        const credit = r.migrateCredit && (p.creditRemaining ?? 0) > 0 ? Math.round((p.creditRemaining as number) * 2) / 2 : null;
        const result = await commitHolidayFile({
          staffId: p.staff!.id,
          fileName: p.fileName,
          records: p.records,
          firstBaseDate: r.applyBase && !p.baseDateIssue ? p.firstBaseDate : null,
          creditBalance: credit,
          balanceAsOf: credit ? asOf : null,
          balanceExpiration: credit ? expiration : null,
        });
        update(i, { result, include: !result.ok });
      }
      setProgress(null);
    });

  const selected = rows.filter((r) => r.include).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">ファイル（複数選択・zip 可）</span>
          <input
            type="file"
            multiple
            accept=".xlsx,.xlsm,.zip"
            aria-label="勤怠管理表ファイル"
            disabled={pending}
            onChange={(e) => onFiles(e.target.files)}
            className="text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">またはフォルダを選ぶ</span>
          <input
            type="file"
            aria-label="勤怠管理表フォルダ"
            disabled={pending}
            onChange={(e) => onFiles(e.target.files)}
            className="text-sm"
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          />
        </label>
      </div>
      {progress && <p className="text-sm text-slate-600">{progress}</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-4 rounded-md bg-slate-50 p-3 text-sm">
            <span className="font-medium">振休・代休の残りを移行する場合：</span>
            <label>
              <span className="mr-1">基準日</span>
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
            </label>
            <label>
              <span className="mr-1">期限</span>
              <input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
            </label>
            <span className="text-xs text-slate-500">期限は原則1か月。あとからスタッフ別の台帳で変更できます</span>
          </div>

          <Table head={["取込", "ファイル", "スタッフ", "期間・区分", "基準日方式", "振休・代休の残り", "確認事項・結果"]}>
            {rows.map((r, i) => {
              const p = r.preview;
              if (!p.ok)
                return (
                  <tr key={i}>
                    <Td>—</Td>
                    <Td>{p.fileName}</Td>
                    <td colSpan={4} className="px-3 py-2">—</td>
                    <Td className="text-rose-700">{p.message}</Td>
                  </tr>
                );
              const errors = p.issues.filter((x) => x.level === "error");
              return (
                <tr key={i} className={r.result?.ok ? "bg-emerald-50" : ""}>
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`${p.fileName}を取り込む`}
                      checked={r.include}
                      disabled={!p.staff || errors.length > 0 || pending}
                      onChange={(e) => update(i, { include: e.target.checked })}
                    />
                  </Td>
                  <Td className="max-w-48 whitespace-normal break-all text-xs">{p.fileName}</Td>
                  <Td>
                    {p.staff ? (
                      <>
                        <div className="font-medium">{p.staff.name}</div>
                        <div className="text-xs text-slate-500">{p.staff.code}</div>
                      </>
                    ) : (
                      <>
                        <div>{p.name ?? "—"}</div>
                        <Badge tone="red">{p.matchNote ?? "照合できません"}</Badge>
                      </>
                    )}
                  </Td>
                  <Td className="whitespace-normal text-xs">
                    {p.periods.map((x) => (
                      <div key={x.sheet}>
                        {x.start.slice(0, 7)}〜{x.end.slice(0, 7)}
                        {x.paidNextCarry !== null && <span className="text-slate-500">（有休 次期繰越 {x.paidNextCarry}日）</span>}
                      </div>
                    ))}
                    <div className="text-slate-500">区分 {p.records.length}日分</div>
                  </Td>
                  <Td className="text-xs">
                    {p.firstBaseDate ? (
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={r.applyBase}
                          disabled={Boolean(p.baseDateIssue) || !r.include || pending}
                          onChange={(e) => update(i, { applyBase: e.target.checked })}
                        />
                        {p.firstBaseDate}
                      </label>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-xs">
                    {(p.creditRemaining ?? 0) > 0 ? (
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={r.migrateCredit}
                          disabled={!r.include || pending}
                          onChange={(e) => update(i, { migrateCredit: e.target.checked })}
                        />
                        {p.creditRemaining}日を移行
                      </label>
                    ) : (
                      <span className="text-slate-500">{p.creditRemaining ?? 0}日</span>
                    )}
                    {p.currentCredit !== null && <div className="text-slate-500">システムの残り {p.currentCredit}日</div>}
                  </Td>
                  <Td className="whitespace-normal text-xs">
                    {p.baseDateIssue && <div className="text-amber-700">{p.baseDateIssue}</div>}
                    {p.issues.slice(0, 3).map((x, n) => (
                      <div key={n} className={x.level === "error" ? "text-rose-700" : "text-amber-700"}>
                        {x.message}
                      </div>
                    ))}
                    {p.issues.length > 3 && <div className="text-amber-700">ほか {p.issues.length - 3}件</div>}
                    {r.result && <div className={r.result.ok ? "text-emerald-700" : "text-rose-700"}>{r.result.message}</div>}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={pending || selected === 0}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "処理中…" : `チェックした${selected}人分を取り込む`}
            </button>
            <span className="text-xs text-slate-500">何度取り込み直しても同じ結果です。画面で手入力した日は上書きしません。</span>
          </div>
        </>
      )}
    </div>
  );
}
