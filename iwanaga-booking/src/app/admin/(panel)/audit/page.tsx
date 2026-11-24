import Link from "next/link";
import { Card } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { assertPermission } from "@/lib/auth/permissions";
import { getRepo } from "@/lib/repo";
import { formatJst } from "@/lib/time";

export default async function AuditPage() {
  const admin = await requireAdminPage();
  assertPermission(admin, "audit");
  const logs = await getRepo().listAudit({ controllers: admin.allowed_controllers, limit: 1000 });
  return (
    <Card title="監査ログ（最新1000件・追記のみ）">
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="border-b border-line text-left text-mist">
            <tr><th className="px-2 py-2 font-normal">日時</th><th className="px-2 py-2 font-normal">操作者</th><th className="px-2 py-2 font-normal">操作</th><th className="px-2 py-2 font-normal">状態</th><th className="px-2 py-2 font-normal">場所</th><th className="px-2 py-2 font-normal">詳細</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-2 py-1.5">{formatJst(a.at)}</td>
                <td className="px-2 py-1.5">{a.actor_type}{a.actor_id ? `:${a.actor_id}` : ""}</td>
                <td className="px-2 py-1.5">{a.reservation_id ? <Link href={`/admin/reservations/${a.reservation_id}`} className="underline">{a.action}</Link> : a.action}</td>
                <td className="px-2 py-1.5">{a.from_status && a.to_status ? `${a.from_status} → ${a.to_status}` : ""}</td>
                <td className="px-2 py-1.5">{a.location_id ?? ""}</td>
                <td className="max-w-80 truncate px-2 py-1.5 text-mist" title={JSON.stringify(a.detail)}>{JSON.stringify(a.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
