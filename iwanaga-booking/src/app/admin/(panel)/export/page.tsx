import { Card } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { assertPermission } from "@/lib/auth/permissions";
import { getRepo } from "@/lib/repo";
import { addDaysToKey, jstDateKey } from "@/lib/time";

export default async function ExportPage() {
  const admin = await requireAdminPage();
  assertPermission(admin, "export");
  const locations = (await getRepo().listLocations()).filter((l) => admin.allowed_controllers.includes(l.controller));
  const today = jstDateKey(new Date());
  const inp = "w-full border border-line px-2 py-2 text-sm";
  return (
    <Card title="CSV出力">
      <p className="mb-4 text-xs text-ink-soft">
        氏名・電話番号を含みます。出力したファイルは目的外に使わず、不要になったら削除してください。出力は監査ログに記録されます。相談内容は出力しません。
        施術場所ごとに管理主体が異なるため、事業をまたいだ利用はしないでください。
      </p>
      <form action="/api/admin/export" method="get" className="grid max-w-xl grid-cols-2 gap-3 text-xs text-mist">
        <label>開始日<input type="date" name="from" required defaultValue={`${today.slice(0, 7)}-01`} className={inp} /></label>
        <label>終了日<input type="date" name="to" required defaultValue={addDaysToKey(today, 30)} className={inp} /></label>
        <label className="col-span-2">
          施術場所
          <select name="location" className={inp}>
            <option value="">権限のあるすべて</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button className="col-span-2 border border-ink bg-ink px-4 py-2.5 text-sm text-paper">CSVをダウンロード</button>
      </form>
    </Card>
  );
}
