import { Card, ReservationTable } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { STATUS_SHORT } from "@/lib/domain/status";
import { getRepo } from "@/lib/repo";
import { searchForAdmin, type SearchForm } from "@/lib/services/admin-queries";

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<SearchForm> }) {
  const admin = await requireAdminPage();
  const repo = getRepo();
  const q = await searchParams;
  const pick = (v: unknown) => (typeof v === "string" ? v : "");
  const form: SearchForm = { code: pick(q.code), phone: pick(q.phone), name: pick(q.name), status: pick(q.status), location: pick(q.location), from: pick(q.from), to: pick(q.to) };
  const rows = await searchForAdmin(repo, admin, form);
  const locations = (await repo.listLocations()).filter((l) => admin.allowed_controllers.includes(l.controller));
  const input = "w-full border border-line bg-paper px-2 py-2 text-sm";
  return (
    <div className="space-y-5">
      <Card title="予約検索">
        <form className="grid grid-cols-2 gap-3 text-xs text-mist md:grid-cols-4">
          <label>予約番号<input name="code" defaultValue={form.code} placeholder="IW-XXXXXX" className={input} /></label>
          <label>電話番号（完全一致）<input name="phone" defaultValue={form.phone} inputMode="tel" className={input} /></label>
          <label>お名前（部分一致）<input name="name" defaultValue={form.name} className={input} /></label>
          <label>
            状態
            <select name="status" defaultValue={form.status} className={input}>
              <option value="">すべて</option>
              {Object.entries(STATUS_SHORT).filter(([k]) => k !== "draft").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>
            施術場所
            <select name="location" defaultValue={form.location} className={input}>
              <option value="">すべて</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.short_name}</option>)}
            </select>
          </label>
          <label>日付（から）<input type="date" name="from" defaultValue={form.from} className={input} /></label>
          <label>日付（まで）<input type="date" name="to" defaultValue={form.to} className={input} /></label>
          <div className="flex items-end"><button className="w-full border border-ink bg-ink px-3 py-2 text-sm text-paper">検索</button></div>
        </form>
      </Card>
      <Card title={`検索結果（${rows.length}件）`}>
        <ReservationTable rows={rows} />
      </Card>
    </div>
  );
}
