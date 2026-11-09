import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppliesTo, RuleStatus } from "@/lib/rules";

export type RuleListRow = {
  rule_id: string; rule_no: string; title: string; current_version_id: string | null; current_version_no: number | null; effective_date: string | null;
  is_provisional: boolean | null; published_at: string | null; applies_to_me: boolean; acknowledged_at: string | null;
  working_version_id: string | null; working_status: RuleStatus | null; working_version_no: number | null; target_count: number | null; ack_count: number | null;
};
export async function listRules(): Promise<RuleListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_rules");
  if (error) throw new Error(error.message);
  return (data ?? []) as RuleListRow[];
}

type VersionBase = { id: string; version_no: number; title: string; body: string; applies_to: AppliesTo; effective_date: string | null; is_provisional: boolean; change_summary: string | null };
export type RuleDetail = {
  rule_id: string; rule_no: string; title: string; can_edit: boolean; can_approve: boolean;
  current: (VersionBase & { published_at: string; self_approved: boolean; approved_by_name: string | null; approved_at: string | null; applies_to_me: boolean; acknowledged_at: string | null }) | null;
  working: (VersionBase & { status: RuleStatus; returned_reason: string | null; version: number; mine: boolean; created_by_name: string | null; submitted_at: string | null; step_id: string | null; step_version: number | null }) | null;
  history: { id: string; version_no: number; status: RuleStatus; effective_date: string | null; published_at: string; change_summary: string | null; is_provisional: boolean; self_approved: boolean; approved_by_name: string | null }[];
};
export async function getRule(no: string): Promise<RuleDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_rule", { p_no: no });
  if (error) throw new Error(error.message);
  return (data as RuleDetail | null) ?? null;
}
export async function getRuleVersion(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_rule_version", { p_version: id });
  if (error) throw new Error(error.message);
  return data as (VersionBase & { rule_no: string; status: RuleStatus; published_at: string | null }) | null;
}
export async function ruleAckStatus(versionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rule_ack_status", { p_version: versionId });
  if (error) throw new Error(error.message);
  return (data ?? []) as { user_id: string; name: string; store_name: string | null; acknowledged_at: string | null }[];
}
export async function myUnacknowledgedRules() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_unacknowledged_rules");
  if (error) throw new Error(error.message);
  return (data ?? []) as { rule_no: string; title: string; version_id: string; version_no: number; published_at: string; is_provisional: boolean }[];
}
export type RuleQueueRow = { step_id: string; step_version: number; version_id: string; rule_no: string; title: string; version_no: number; change_summary: string | null;
  effective_date: string | null; is_provisional: boolean; submitted_by_name: string | null; submitted_at: string; self_authored: boolean };
export async function ruleQueue(): Promise<RuleQueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_rule_queue");
  if (error) throw new Error(error.message);
  return (data ?? []) as RuleQueueRow[];
}
