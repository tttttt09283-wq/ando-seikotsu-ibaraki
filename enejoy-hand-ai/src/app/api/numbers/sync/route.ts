import { NextResponse, type NextRequest } from "next/server";
import { syncSheets } from "@/lib/engine/engine";
import { fetchSheetGrid } from "@/lib/import/google-sheets";
import { checkSameOrigin, engineErrorResponse, readJson, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps } from "@/lib/server/runtime";

/** 日計表を今すぐ読み取る（all: true なら登録済みの全月） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  try {
    const body = ((await readJson(req).catch(() => ({}))) ?? {}) as { all?: boolean };
    const deps = getEngineDeps();
    const months = body.all ? (await deps.store.read()).dataSources.sheets.map((s) => s.month) : undefined;
    const sync = await syncSheets(deps, fetchSheetGrid, { months, actorId: actor.memberId });
    return await snapshotResponse(actor, 200, { sync });
  } catch (e) {
    return engineErrorResponse(e);
  }
}
