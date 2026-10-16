import { addClinic, removeClinic, updateClinic } from "@/lib/engine/clinics-admin";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { clinicInputSchema } from "@/lib/types";

/** 院の設定：新しい院の追加（店舗展開）・開院月／閉院月の変更・追加した院の削除 */
export const POST = operatorPost(clinicInputSchema, async (input, actor) => {
  const deps = getEngineDeps();
  if (input.action === "add") {
    const c = await addClinic(deps, actor.memberId, input);
    return { clinicId: c.id };
  }
  if (input.action === "update") {
    await updateClinic(deps, actor.memberId, input);
    return;
  }
  await removeClinic(deps, actor.memberId, input.id);
});
