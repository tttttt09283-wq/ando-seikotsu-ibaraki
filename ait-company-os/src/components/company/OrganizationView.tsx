"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AGENT_STATUS_JA } from "./labels";
import { CompanyMap, StatusLegend } from "./CompanyMap";
import { StatusDot } from "./MemberParts";
import { useCompany } from "./StateProvider";
import type { AgentStatus } from "@/lib/types";

export function OrganizationView() {
  const { snapshot } = useCompany();
  const ai = snapshot.members.filter((m) => !m.isHuman);
  const counts = ai.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});
  const order: AgentStatus[] = ["WORKING", "THINKING", "REVIEWING", "WAITING_APPROVAL", "IDLE", "STANDBY", "ERROR"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">LIVE COMPANY MAP</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          CEO → CHAD → AI役員 → AIマネージャー → AI社員。稼働状態は実際のTask処理と保存データから算出しています（架空の稼働は表示しません）。
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="font-semibold">AIメンバー {ai.length}名</span>
          {order
            .filter((s) => counts[s])
            .map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <StatusDot status={s} />
                {AGENT_STATUS_JA[s]} {counts[s]}
              </span>
            ))}
        </CardContent>
      </Card>
      <StatusLegend />
      <CompanyMap />
      <p className="text-muted-foreground text-xs">
        組織は必要最小限の人数で構成しています。増員・配置転換はCHADが業務量を分析して提案し、追加費用が発生する変更はCEO承認後にのみ反映されます。
      </p>
    </div>
  );
}
