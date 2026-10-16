import "server-only";
import { EngineError } from "@/lib/engine/engine";
import { parseCsv } from "@/lib/import/csv";
import { fetchSheetByUrl } from "@/lib/import/google-sheets";
import type { NumberSource } from "@/lib/types";

/** 取り込みの入力（CSVの中身 または GoogleスプレッドシートのURL）を表にする */
export async function gridFromInput(input: { csv?: string; url?: string; fileName?: string }): Promise<{ grid: string[][]; label: string; source: NumberSource }> {
  if (input.csv && input.csv.trim()) return { grid: parseCsv(input.csv), label: input.fileName || "CSV", source: "csv" };
  if (input.url) {
    try {
      const { grid, title } = await fetchSheetByUrl(input.url);
      return { grid, label: title ? `スプレッドシート「${title}」` : "スプレッドシート", source: "sheet" };
    } catch (e) {
      throw new EngineError((e as Error).message, "INVALID_STATE");
    }
  }
  throw new EngineError("CSVファイルを選ぶか、GoogleスプレッドシートのURLを入れてください", "INVALID_STATE");
}
