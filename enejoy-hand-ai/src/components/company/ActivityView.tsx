"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getMember, TENANT } from "@/tenant";
import { ActivityStream } from "./ActivityStream";
import { useCompany } from "./StateProvider";

/** 活動ログ（AI部門の処理の流れ）と監査ログ（人の操作の記録） */
export function ActivityView() {
  const { snapshot } = useCompany();
  const [member, setMember] = React.useState<string>("all");
  const members = TENANT.members.filter((m) => snapshot.activities.some((a) => a.actorId === m.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">活動ログ</h1>
        <p className="text-muted-foreground mt-1 text-sm">AI部門で実際に起きたことを時系列で表示します。人の操作（指示・承認・売上の入力・ログイン）は監査ログに残ります。</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        <Card>
          <CardHeader className="flex-wrap">
            <div>
              <CardTitle>AI部門の動き</CardTitle>
              <CardDescription>直近200件</CardDescription>
            </div>
            {snapshot.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="メンバーで絞り込み">
              {[{ id: "all", name: "全員" }, ...members].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={member === m.id}
                  onClick={() => setMember(m.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs transition",
                    member === m.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent",
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <ActivityStream limit={200} filter={member === "all" ? undefined : (a) => a.actorId === member} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>監査ログ</CardTitle>
              <CardDescription>誰が・いつ・何をしたか（直近150件）</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {snapshot.audit.length === 0 ? (
              <p className="text-muted-foreground text-sm">まだ記録はありません。</p>
            ) : (
              <ol className="divide-y text-xs">
                {snapshot.audit.map((e) => (
                  <li key={e.id} className="space-y-0.5 py-2">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground tabular-nums">{formatDateTime(e.at)}</span>
                      <span className="font-medium">{getMember(e.actor)?.name ?? e.actor}</span>
                      <span className="text-muted-foreground font-mono">{e.action}</span>
                    </div>
                    {e.detail && <div className="break-all">{e.detail}</div>}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
