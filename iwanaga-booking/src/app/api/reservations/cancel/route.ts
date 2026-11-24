import { getRepo } from "@/lib/repo";
import { cancelByCustomer } from "@/lib/services/reservations";
import { clientIp, json, rateLimit, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/reservations/cancel {c, t} … 確定前の仮予約を利用者が取り消す */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403);
  if (!rateLimit(`cancel:${clientIp(req)}`, 10, 60_000)) return json({ ok: false }, 429);
  const b = (await req.json().catch(() => ({}))) as { c?: string; t?: string };
  const r = await cancelByCustomer(getRepo(), String(b.c ?? ""), String(b.t ?? ""), new Date());
  return json(r, r.ok ? 200 : 400);
}
