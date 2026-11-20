import Link from "next/link";
import { Card } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { getRepo } from "@/lib/repo";
import { kindLabel } from "@/lib/services/notifications";
import { formatJst } from "@/lib/time";

const CHANNEL: Record<string, string> = { line_push: "LINE送信", line_reply: "LINE返信", email: "メール", admin_panel: "管理画面", manual: "手動" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  const recipient = sp.to === "admin" ? "admin" : sp.to === "customer" ? "customer" : undefined;
  const logs = await getRepo().listNotifications({ recipient, controllers: admin.allowed_controllers, limit: 500 });
  return (
    <Card
      title="通知履歴（LINE・メール・管理画面）"
      action={
        <div className="flex gap-1 text-xs">
          {[["", "すべて"], ["customer", "お客様宛て"], ["admin", "管理者宛て"]].map(([k, v]) => (
            <Link key={k} href={`/admin/notifications${k ? `?to=${k}` : ""}`} className={`border px-3 py-1 ${String(recipient ?? "") === k ? "border-ink bg-ink text-paper" : "border-line"}`}>{v}</Link>
          ))}
        </div>
      }
    >
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-xs text-mist">
            <tr><th className="px-2 py-2 font-normal">日時</th><th className="px-2 py-2 font-normal">種類</th><th className="px-2 py-2 font-normal">宛先・経路</th><th className="px-2 py-2 font-normal">結果</th><th className="px-2 py-2 font-normal">内容</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((n) => (
              <tr key={n.id}>
                <td className="whitespace-nowrap px-2 py-2 text-xs">{formatJst(n.created_at)}</td>
                <td className="px-2 py-2">{kindLabel(n.kind)}</td>
                <td className="px-2 py-2 text-xs">{n.recipient === "admin" ? "管理者" : "お客様"}・{CHANNEL[n.channel] ?? n.channel}{n.attempt > 1 ? `（${n.attempt}回目）` : ""}</td>
                <td className={`px-2 py-2 text-xs ${n.status === "sent" ? "text-ok" : n.status === "failed" ? "text-ng" : "text-warn"}`}>{n.status}{n.error && <span className="block text-mist">{n.error}</span>}</td>
                <td className="px-2 py-2 text-xs">{n.reservation_id ? <Link href={`/admin/reservations/${n.reservation_id}`} className="underline">{n.summary}</Link> : n.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="p-2 text-sm text-mist">ありません。</p>}
      </div>
    </Card>
  );
}
