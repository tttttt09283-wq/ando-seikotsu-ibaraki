import "server-only";
import type { AdminClient } from "@/lib/db/admin";
import { todayInTimeZone, type IsoDate } from "@/lib/dates";
import { evaluateRule, isConditionResolved, resolveAssignee, type Membership } from "./evaluate";
import type { CustomerSnapshot, FollowupRule, SkipReason } from "./types";

export type GenerationResult = {
  organizationId: string;
  asOf: IsoDate;
  created: number;
  alreadyExisted: number;
  resolved: number;
  skipped: Partial<Record<SkipReason, number>>;
};

type Options = {
  organizationId: string;
  /** 指定時はこの店舗の顧客のみ対象（Store Manager の「今すぐ抽出」） */
  storeIds?: string[];
  asOf?: IsoDate;
  actorUserId?: string | null;
  now?: Date;
  /** true の場合は判定のみ（挿入・更新・監査ログなし）。「フォロー条件」画面のプレビュー用 */
  dryRun?: boolean;
};

const CHUNK = 500;

/**
 * フォロータスクの抽出（service_role で実行）。
 * 判定は純粋関数 evaluateRule、重複防止は DB の一意制約（ON CONFLICT DO NOTHING）で担保する。
 * 何度実行しても、同時に実行しても同じ結果になる（冪等）。
 */
export async function generateFollowupTasks(admin: AdminClient, opts: Options): Promise<GenerationResult> {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, status, timezone, settings")
    .eq("id", opts.organizationId)
    .single();
  if (orgErr || !org) throw new Error("organization not found");

  const asOf = opts.asOf ?? todayInTimeZone(org.timezone, opts.now);
  const result: GenerationResult = { organizationId: org.id, asOf, created: 0, alreadyExisted: 0, resolved: 0, skipped: {} };
  if (org.status !== "active") return result;

  const includeUnknownConsent = (org.settings as { include_unknown_consent?: boolean } | null)?.include_unknown_consent === true;
  const storeFilter = opts.storeIds ? new Set(opts.storeIds) : null;

  const [rulesRes, snapsRes, membersRes] = await Promise.all([
    admin.from("followup_rules").select("*").eq("organization_id", org.id),
    admin.rpc("followup_customer_snapshots", { p_org: org.id, p_as_of: asOf }),
    admin.from("memberships").select("user_id, role, store_id").eq("organization_id", org.id).eq("status", "active"),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (snapsRes.error) throw snapsRes.error;
  if (membersRes.error) throw membersRes.error;

  const allRules = (rulesRes.data ?? []) as FollowupRule[];
  const rules = allRules.filter((r) => r.is_active && (!storeFilter || r.store_id === null || storeFilter.has(r.store_id)));
  const snapshots = ((snapsRes.data ?? []) as CustomerSnapshot[]).filter((c) => !storeFilter || storeFilter.has(c.store_id));
  const memberships = (membersRes.data ?? []) as Membership[];

  // 1) 判定
  const rows = [];
  for (const rule of rules) {
    for (const c of snapshots) {
      const r = evaluateRule(rule, c, asOf, { includeUnknownConsent });
      if (!r.eligible) {
        result.skipped[r.reason] = (result.skipped[r.reason] ?? 0) + 1;
        continue;
      }
      rows.push({
        organization_id: org.id,
        store_id: c.store_id,
        customer_id: c.customer_id,
        rule_id: rule.id,
        period_key: r.periodKey,
        title: rule.name,
        task_kind: rule.task_kind,
        priority: rule.priority,
        due_on: r.dueOn,
        assigned_to: resolveAssignee(rule, c, memberships),
        template_id: rule.default_template_id,
        created_by: opts.actorUserId ?? null,
      });
    }
  }

  if (opts.dryRun) {
    result.created = rows.length;
    return result;
  }

  // 2) 挿入（重複は DB の一意制約で無視）
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("followup_tasks")
      .upsert(chunk, { onConflict: "organization_id,rule_id,customer_id,period_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    result.created += data?.length ?? 0;
    result.alreadyExisted += chunk.length - (data?.length ?? 0);
  }

  // 3) 条件が解消した未完了タスクを対象外へ
  const { data: openTasks, error: openErr } = await admin
    .from("followup_tasks")
    .select("id, rule_id, customer_id, period_key, store_id")
    .eq("organization_id", org.id)
    .in("status", ["open", "on_hold"])
    .not("rule_id", "is", null);
  if (openErr) throw openErr;

  const ruleById = new Map(allRules.map((r) => [r.id, r]));
  const snapById = new Map(snapshots.map((s) => [s.customer_id, s]));
  const resolvedIds = (openTasks ?? [])
    .filter((t) => {
      const rule = ruleById.get(t.rule_id!);
      const snap = snapById.get(t.customer_id);
      return rule && snap && !snap.is_deleted && isConditionResolved(rule, t.period_key!, snap);
    })
    .map((t) => t.id);

  for (let i = 0; i < resolvedIds.length; i += CHUNK) {
    const ids = resolvedIds.slice(i, i + CHUNK);
    const { error } = await admin
      .from("followup_tasks")
      .update({ status: "not_applicable", close_reason: "condition_resolved" })
      .in("id", ids);
    if (error) throw error;
    result.resolved += ids.length;
  }

  await admin.from("audit_logs").insert({
    organization_id: org.id,
    actor_user_id: opts.actorUserId ?? null,
    action: opts.actorUserId ? "followup.generated_manual" : "followup.generated_scheduled",
    entity_type: "followup_tasks",
    changes: { asOf, created: result.created, resolved: result.resolved, stores: opts.storeIds ?? "all" },
  });

  return result;
}

/** 全ての有効な組織に対して実行（日次 Cron） */
export async function generateForAllOrganizations(admin: AdminClient, now = new Date()) {
  const { data: orgs, error } = await admin.from("organizations").select("id").eq("status", "active");
  if (error) throw error;
  const results: GenerationResult[] = [];
  for (const o of orgs ?? []) {
    results.push(await generateFollowupTasks(admin, { organizationId: o.id, now }));
  }
  return results;
}
