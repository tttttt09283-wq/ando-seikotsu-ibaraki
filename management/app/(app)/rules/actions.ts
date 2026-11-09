"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/server/session";
import { friendlyDbError } from "@/lib/db-error";
import { back } from "@/server/redirect-with";

const noRe = /^\d{3}$/;
const uuidRe = /^[0-9a-f-]{36}$/;
const dateOrNull = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const appliesFrom = (fd: FormData) => {
  const roles = fd.getAll("roles").map(String), emp = fd.getAll("employment_types").map(String);
  return { ...(roles.length ? { roles } : {}), ...(emp.length ? { employment_types: emp } : {}) };
};
const ruleNo = (fd: FormData) => { const n = String(fd.get("rule_no") ?? ""); return noRe.test(n) ? n : "000"; };

export type RuleFormState = { error?: string };
export async function createRule(_prev: RuleFormState, fd: FormData): Promise<RuleFormState> {
  await requireMe();
  const no = String(fd.get("rule_no") ?? "").trim();
  if (!noRe.test(no)) return { error: "規定番号は3けたの数字です（例：006）" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_rule", {
    p_no: no, p_title: String(fd.get("title") ?? ""), p_body: String(fd.get("body") ?? "").slice(0, 50000), p_applies: appliesFrom(fd),
    p_effective: dateOrNull(fd.get("effective_date")), p_provisional: fd.get("is_provisional") === "on", p_summary: null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/rules");
  redirect(`/rules/${no}/edit?ok=${encodeURIComponent("下書きを作りました。内容を確かめて、社長に承認を依頼してください")}`);
}

export async function createDraft(fd: FormData) {
  const no = ruleNo(fd);
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_rule_draft", { p_rule: String(fd.get("rule_id")) });
  if (error) back(`/rules/${no}`, "err", friendlyDbError(error));
  revalidatePath(`/rules/${no}`);
  back(`/rules/${no}/edit`, "ok", "公開中の版を写して改定案を作りました");
}

export type DraftState = { error?: string; ok?: string };
export async function saveDraft(_prev: DraftState, fd: FormData): Promise<DraftState> {
  await requireMe();
  const no = ruleNo(fd), id = String(fd.get("version_id") ?? "");
  if (!uuidRe.test(id)) return { error: "改定案が見つかりません" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_rule_draft", {
    p_version: id, p_title: String(fd.get("title") ?? ""), p_body: String(fd.get("body") ?? "").slice(0, 50000), p_applies: appliesFrom(fd),
    p_effective: dateOrNull(fd.get("effective_date")), p_provisional: fd.get("is_provisional") === "on", p_summary: String(fd.get("change_summary") ?? ""),
    p_expected_version: Number(fd.get("row_version")) || null,
  });
  if (error) return { error: friendlyDbError(error) };
  if (fd.get("intent") === "submit") {
    const { error: e2 } = await supabase.rpc("submit_rule_version", { p_version: id });
    if (e2) { revalidatePath(`/rules/${no}/edit`); return { error: "保存しましたが、承認を依頼できませんでした：" + friendlyDbError(e2) }; }
    revalidatePath(`/rules/${no}`);
    redirect(`/rules/${no}/edit?ok=${encodeURIComponent("社長に承認を依頼しました")}`);
  }
  revalidatePath(`/rules/${no}/edit`);
  redirect(`/rules/${no}/edit?ok=${encodeURIComponent("下書きを保存しました")}`);
}

async function simple(fd: FormData, fn: string, ok: string, to: "edit" | "view" = "edit") {
  const no = ruleNo(fd);
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_version: String(fd.get("version_id")) });
  const path = to === "edit" ? `/rules/${no}/edit` : `/rules/${no}`;
  if (error) back(path, "err", friendlyDbError(error));
  revalidatePath(`/rules/${no}`); revalidatePath("/rules");
  back(path, "ok", ok);
}
export async function withdrawVersion(fd: FormData) { await simple(fd, "withdraw_rule_version", "取り下げて下書きに戻しました"); }
export async function deleteDraft(fd: FormData) { await simple(fd, "delete_rule_draft", "改定案を削除しました", "view"); }
export async function publishVersion(fd: FormData) { await simple(fd, "publish_rule_version", "公開しました。対象の人に通知しました", "view"); }
export async function acknowledgeRule(fd: FormData) { await simple(fd, "acknowledge_rule", "確認しました。ありがとうございます", "view"); }

export async function decideRule(fd: FormData) {
  await requireMe();
  const backTo = String(fd.get("back_to") || "/approvals");
  const action = String(fd.get("action"));
  if (!["approve", "return"].includes(action)) back(backTo, "err", "操作が正しくありません");
  const key = String(fd.get("idempotency_key") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_rule_step", {
    p_step: String(fd.get("step_id")), p_action: action, p_reason: String(fd.get("reason") ?? "") || null,
    p_expected_version: Number(fd.get("version")) || null, p_idempotency_key: uuidRe.test(key) ? key : null,
  });
  if (error) back(backTo, "err", friendlyDbError(error));
  revalidatePath("/approvals"); revalidatePath("/rules");
  back(backTo, "ok", action === "approve" ? "承認しました。「公開する」を押すと、スタッフに表示されます" : "差戻しました");
}
