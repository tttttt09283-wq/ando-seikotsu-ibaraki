import { requestReviewReply } from "@/lib/engine/reputation";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { replyDraftSchema } from "@/lib/types";

/** 口コミへの返信文の承認を依頼する（承認されるまで投稿しない） */
export const POST = operatorPost(replyDraftSchema, async (input, actor) => {
  const a = await requestReviewReply(getEngineDeps(), actor.memberId, input);
  return { approvalId: a.id };
});
