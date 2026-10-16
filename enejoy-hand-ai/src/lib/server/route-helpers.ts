import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { checkSameOrigin, engineErrorResponse, jsonError, readJson, requireRole, snapshotResponse, type Actor } from "./api";

/**
 * 統括責任者だけが使う「状態を変える」API の共通処理：
 * 同一オリジン確認 → 役割の確認 → 入力の検証 → 処理 → 最新の画面データを返す
 */
export function operatorPost<S extends z.ZodTypeAny>(
  schema: S,
  handler: (input: z.infer<S>, actor: Actor) => Promise<Record<string, unknown> | void>,
  opts: { maxBytes?: number } = {},
) {
  return async (req: NextRequest) => {
    const bad = checkSameOrigin(req);
    if (bad) return bad;
    const actor = await requireRole(req, ["operator"]);
    if (actor instanceof NextResponse) return actor;
    let input: z.infer<S>;
    try {
      const parsed = schema.safeParse(await readJson(req, opts.maxBytes));
      if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "入力内容が正しくありません");
      input = parsed.data;
    } catch {
      return jsonError(400, "入力内容が正しくありません");
    }
    try {
      const extra = await handler(input, actor);
      return await snapshotResponse(actor, 200, extra ?? undefined);
    } catch (e) {
      return engineErrorResponse(e);
    }
  };
}
