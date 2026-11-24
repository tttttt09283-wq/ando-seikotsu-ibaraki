import { getRepo } from "@/lib/repo";
import { createReservation } from "@/lib/services/reservations";
import { verifyLiffIdToken } from "@/lib/line/liff";
import { clientIp, json, rateLimit, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/reservations … 仮予約（pending_line）を作る。確定はしない */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, message: "不正なリクエストです" }, 403);
  if (!rateLimit(`reserve:${clientIp(req)}`, 5, 10 * 60_000)) return json({ ok: false, message: "短時間に送信が続いたため受付を一時停止しています。しばらくしてからお試しください。" }, 429);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "不正なリクエストです" }, 400);
  }
  // ボット対策（人には見えない入力欄に値が入っていたら受け付けない）
  if (typeof body.website === "string" && body.website !== "") return json({ ok: false, message: "受付できませんでした" }, 400);
  const r = await createReservation(getRepo(), body, { now: new Date(), verifyLiff: (t) => verifyLiffIdToken(t) });
  return json(r, r.ok ? 201 : 400);
}
