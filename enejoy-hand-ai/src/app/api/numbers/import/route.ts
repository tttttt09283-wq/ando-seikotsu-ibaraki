import { NextResponse, type NextRequest } from "next/server";
import { importBusinessPlan, importDailyReport } from "@/lib/engine/engine";
import { parseCsv } from "@/lib/import/csv";
import { checkSameOrigin, engineErrorResponse, jsonError, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";
import { importInputSchema } from "@/lib/types";

/** CSVの取り込み（日計表のTOPシート／事業計画書）。統括責任者のみ */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;

  let input;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 2_500_000) return jsonError(413, "ファイルが大きすぎます");
    const parsed = importInputSchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "入力内容が正しくありません");
    input = parsed.data;
  } catch {
    return jsonError(400, "入力内容が正しくありません");
  }
  try {
    const deps = getEngineDeps();
    const grid = parseCsv(input.csv);
    if (input.kind === "daily") {
      if (!input.month) return jsonError(400, "対象月を選んでください");
      const result = await importDailyReport(deps, actor.memberId, { month: input.month, grid, source: "csv", sourceLabel: input.fileName });
      return await snapshotResponse(actor, 200, { result });
    }
    const result = await importBusinessPlan(deps, actor.memberId, { grid, label: input.fileName });
    return await snapshotResponse(actor, 200, { result });
  } catch (e) {
    return engineErrorResponse(e);
  }
}
