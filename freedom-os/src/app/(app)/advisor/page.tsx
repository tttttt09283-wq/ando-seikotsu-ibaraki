import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { aiConfigured, env } from "@/lib/server/env";
import { buildAdvisorPayload, rulesAdvice } from "@/lib/domain/advisor";
import { AdvisorView } from "./advisor-view";

export const metadata = { title: "AI経営参謀" };

export default async function AdvisorPage() {
  const { model: m } = await getAppModel();
  const configured = aiConfigured();
  const preview = buildAdvisorPayload(m, "weekly");
  return (
    <div>
      <PageHeader
        title="AI経営参謀"
        description={configured ? `Claude（${env.anthropicModel}）がサーバー経由で分析します。提案は自動では実行されず、承認したものだけタスクに登録されます。` : "AI API キーが未設定のため、ルールベースで分析します（通常の管理機能はすべて使えます）。"}
      />
      <AdvisorView
        configured={configured}
        live={rulesAdvice(m)}
        insights={m.snapshot.insights.slice(0, 20).map((i) => ({ id: i.id, kind: i.kind, source: i.source, model: i.model, created_at: i.created_at ?? "", output: i.output, approved: i.approved_action_indexes ?? [] }))}
        payloadPreview={JSON.stringify(preview, null, 2)}
      />
    </div>
  );
}
