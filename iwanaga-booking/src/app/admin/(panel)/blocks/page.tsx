import ActionForm from "@/components/admin/ActionForm";
import { Card } from "@/components/admin/parts";
import { requireAdminPage } from "@/lib/auth/admin";
import { assertPermission } from "@/lib/auth/permissions";
import { getRepo } from "@/lib/repo";
import { addMinutes, formatJst, jstDateKey, jstTime } from "@/lib/time";
import { addBlockAction, deleteBlockAction } from "../../actions";

export default async function BlocksPage() {
  const admin = await requireAdminPage();
  assertPermission(admin, "settings");
  const repo = getRepo();
  const now = new Date();
  const blocks = await repo.listBlocks(addMinutes(now, -60 * 24).toISOString(), addMinutes(now, 60 * 24 * 365).toISOString());
  const locations = (await repo.listLocations()).filter((l) => admin.allowed_controllers.includes(l.controller));
  const name = (id: string | null) => (id ? locations.find((l) => l.id === id)?.short_name ?? id : "全拠点（本人の予定）");
  const inp = "w-full border border-line px-2 py-2 text-sm";
  return (
    <div className="grid gap-5 md:grid-cols-[22rem_1fr]">
      <Card title="予約枠をブロックする">
        <ActionForm action={addBlockAction} label="ブロックを追加" confirmMessage="この時間帯は新しい予約を受け付けなくなります（既存の予約はそのままです）。">
          <div className="space-y-2 text-xs text-mist">
            <label className="block">
              対象
              <select name="location_id" className={inp}>
                <option value="">全拠点（本人の予定・移動など）</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}のみ</option>)}
              </select>
            </label>
            <label className="block">開始日<input type="date" name="date" required defaultValue={jstDateKey(now)} className={inp} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label>開始時刻<input type="time" name="start_time" required defaultValue="10:00" className={inp} /></label>
              <label>終了時刻<input type="time" name="end_time" required defaultValue="12:00" className={inp} /></label>
            </div>
            <label className="block">終了日（複数日にまたがる場合）<input type="date" name="end_date" className={inp} /></label>
            <label className="block">理由（任意・お客様には表示しません）<input name="reason" maxLength={100} className={inp} /></label>
          </div>
        </ActionForm>
      </Card>
      <Card title="ブロック一覧">
        {blocks.length === 0 ? (
          <p className="text-sm text-mist">ありません。</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {formatJst(b.start_at)}〜{jstDateKey(b.start_at) === jstDateKey(b.end_at) ? jstTime(b.end_at) : formatJst(b.end_at)}
                  <span className="ml-2 text-xs text-mist">{name(b.location_id)} {b.reason}</span>
                </span>
                <div className="w-20"><ActionForm action={deleteBlockAction} hidden={{ block_id: b.id }} tone="danger" label="削除" /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
