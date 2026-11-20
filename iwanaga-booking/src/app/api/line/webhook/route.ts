import { getRepo } from "@/lib/repo";
import { processLineWebhook } from "@/lib/line/webhook";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/line/webhook … LINE Messaging API の Webhook URL に設定する */
export async function POST(req: Request) {
  // 署名検証のため、パース前の生のボディを使う
  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ ok: false }, 413);
  const out = await processLineWebhook(getRepo(), raw, req.headers.get("x-line-signature"), new Date());
  return json(out.body, out.status);
}
