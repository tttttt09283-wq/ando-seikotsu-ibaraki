import { NextResponse, type NextRequest } from "next/server";
import { refreshCompetitors, syncGoogle } from "@/lib/engine/reputation";
import { checkSameOrigin, engineErrorResponse, jsonError, requireRole, snapshotResponse } from "@/lib/server/api";
import { getEngineDeps, getGoogleApiIfConnected, getPlacesApi } from "@/lib/server/runtime";

/** 口コミ・表示回数・競合を今すぐ読み取る（読み取りのみ） */
export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const actor = await requireRole(req, ["operator"]);
  if (actor instanceof NextResponse) return actor;
  const api = await getGoogleApiIfConnected();
  const places = getPlacesApi();
  if (!api && !places) return jsonError(409, "Googleアカウントが未接続で、Places APIのキーもありません");
  try {
    const deps = getEngineDeps();
    const google = api ? await syncGoogle(deps, api, { actorId: actor.memberId }) : null;
    const competitors = places ? await refreshCompetitors(deps, places, { actorId: actor.memberId }) : null;
    return await snapshotResponse(actor, 200, { google, competitors });
  } catch (e) {
    return engineErrorResponse(e);
  }
}
