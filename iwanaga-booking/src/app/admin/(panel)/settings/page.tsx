import Link from "next/link";
import { Card } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { assertPermission } from "@/lib/auth/permissions";
import { locationGate } from "@/lib/domain/gate";
import { getRepo } from "@/lib/repo";

export default async function SettingsIndex() {
  const admin = await requireAdminPage();
  assertPermission(admin, "settings");
  const repo = getRepo();
  const locations = (await repo.listLocations()).filter((l) => admin.allowed_controllers.includes(l.controller));
  const services = await repo.listServices();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {locations.map((l) => {
        const g = locationGate(l);
        const svcs = services.filter((s) => s.location_id === l.id);
        return (
          <Link key={l.id} href={`/admin/settings/${l.id}`} className="block">
            <Card title={l.name}>
              <p className={`text-sm ${g.ok ? "text-ok" : "text-warn"}`}>{g.ok ? "受付中" : g.reason}</p>
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                <li>管理主体：{l.controller_name}</li>
                <li>{l.kind === "home" ? `開業準備完了：${l.opening_ready ? "済" : "未"}` : `会社の正式承認：${l.company_approved ? "済" : "未"}`}</li>
                <li>メニュー：{svcs.length}件（公開 {svcs.filter((s) => s.is_published).length}件）</li>
              </ul>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
