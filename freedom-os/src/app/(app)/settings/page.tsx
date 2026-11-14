import { PageHeader } from "@/components/common/parts";
import { getAppModel } from "@/lib/server/snapshot";
import { requireSession } from "@/lib/server/session";
import { aiConfigured } from "@/lib/server/env";
import { SettingsForm } from "./settings-form";
import { DataPanel } from "./data-panel";

export const metadata = { title: "設定・データ" };

export default async function SettingsPage() {
  const { model: m, mode } = await getAppModel();
  const session = await requireSession();
  const logs = (await session.store.list("audit_logs"))
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, 50)
    .map((l) => ({ id: String(l.id), at: String(l.created_at ?? ""), table: l.table_name, action: l.action, record: l.record_id }));
  return (
    <div className="space-y-6">
      <PageHeader title="設定・データ" description="目標値・判定基準・税負担率などはすべてここで変更できます。売上・事業所得・税引後手取りは別々に計算されます。" />
      <SettingsForm settings={m.snapshot.settings} profile={m.snapshot.profile} />
      <DataPanel mode={mode} ai={aiConfigured()} logs={logs} />
    </div>
  );
}
