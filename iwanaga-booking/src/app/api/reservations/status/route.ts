import { getRepo } from "@/lib/repo";
import { getCustomerView } from "@/lib/services/reservations";
import { clientIp, json, rateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/reservations/status?c=IW-XXXXXX&t=<token> … 利用者向けの予約状況（個人情報は返さない） */
export async function GET(req: Request) {
  if (!rateLimit(`status:${clientIp(req)}`, 60, 60_000)) return json({ error: "too many requests" }, 429);
  const u = new URL(req.url);
  const v = await getCustomerView(getRepo(), u.searchParams.get("c") ?? "", u.searchParams.get("t") ?? "", new Date());
  return v ? json(v) : json({ error: "not found" }, 404);
}
