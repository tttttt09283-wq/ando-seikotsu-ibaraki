import { cancelAutoReplyJob, editAutoReplyJob, processAutoReplies, requestAutoReplyPolicy, stopAutoReply } from "@/lib/engine/auto-reply";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps, getGoogleApiIfConnected } from "@/lib/server/runtime";
import { autoReplyInputSchema } from "@/lib/types";

/** 口コミの自動返信：ルールの承認依頼・停止・予定の取りやめ／書き換え・今すぐ処理（統括責任者のみ） */
export const POST = operatorPost(
  autoReplyInputSchema,
  async (input, actor) => {
    const deps = getEngineDeps();
    switch (input.action) {
      case "request": {
        const { action: _a, ...settings } = input;
        void _a;
        return { approvalId: (await requestAutoReplyPolicy(deps, actor.memberId, settings)).id };
      }
      case "stop":
        return void (await stopAutoReply(deps, actor.memberId));
      case "cancel_job":
        return void (await cancelAutoReplyJob(deps, actor.memberId, input.id));
      case "edit_job":
        return void (await editAutoReplyJob(deps, actor.memberId, input.id, input.comment));
      case "run":
        return { result: await processAutoReplies(deps, await getGoogleApiIfConnected()) };
    }
  },
  { maxBytes: 50_000 },
);
