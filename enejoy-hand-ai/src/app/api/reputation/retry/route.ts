import { z } from "zod";
import { retryApprovedAction } from "@/lib/engine/reputation";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps, getGoogleApiIfConnected } from "@/lib/server/runtime";

/** 承認済みで投稿に失敗した返信をやり直す */
export const POST = operatorPost(z.object({ approvalId: z.string().regex(/^apv_[a-z0-9]{12}$/) }), async (input) => {
  const execution = await retryApprovedAction(getEngineDeps(), input.approvalId, await getGoogleApiIfConnected());
  return { execution };
});
