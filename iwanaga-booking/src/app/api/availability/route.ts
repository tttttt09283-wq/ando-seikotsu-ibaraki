import { getRepo } from "@/lib/repo";
import { getAvailability, getAvailableDates } from "@/lib/services/reservations";
import { clientIp, json, rateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/availability?location=home&service=<id>[&date=YYYY-MM-DD] */
export async function GET(req: Request) {
  if (!rateLimit(`avail:${clientIp(req)}`, 120, 60_000)) return json({ error: "しばらくしてからお試しください" }, 429);
  const u = new URL(req.url);
  const location = u.searchParams.get("location") ?? "";
  const service = u.searchParams.get("service") ?? "";
  const date = u.searchParams.get("date");
  const repo = getRepo();
  const now = new Date();
  if (!date) return json({ dates: await getAvailableDates(repo, location, service, now) });
  const r = await getAvailability(repo, location, service, date, now);
  return r.ok ? json({ slots: r.slots }) : json({ error: r.error }, 400);
}
