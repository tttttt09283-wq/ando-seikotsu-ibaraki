import { getRepo } from "@/lib/repo";
import { expireHolds } from "@/lib/services/reservations";
import { cronAuthorized, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** 期限切れホールドの自動解放（Vercel Cron。予約作成・空き枠取得・Webhook 時にも都度解放している） */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return json({ ok: false }, 401);
  const expired = await expireHolds(getRepo(), new Date());
  return json({ ok: true, expired });
}
