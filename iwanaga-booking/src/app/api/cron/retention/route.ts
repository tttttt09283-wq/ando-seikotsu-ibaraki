import { getRepo } from "@/lib/repo";
import { runRetention } from "@/lib/services/reservations";
import { cronAuthorized, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** 保持期間を過ぎた相談内容の削除・顧客情報の匿名化（Vercel Cron・毎日） */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return json({ ok: false }, 401);
  const r = await runRetention(getRepo(), new Date());
  return json({ ok: true, ...r });
}
