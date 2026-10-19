import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, Input } from "@/components/ui";
import { formatJstDateTime } from "@/lib/time/jst";
import { issuePin, unlockPin } from "../actions";

export interface PinStatus {
  has_pin: boolean;
  must_change: boolean;
  locked_until: string | null;
  failed_count: number;
  pin_set_at: string | null;
}

/** 共用端末の本人確認用 PIN（発行・ロック解除）。PIN そのものは誰も参照できない */
export function PinCard({ staffId, staffCode, status }: { staffId: string; staffCode: string; status: PinStatus | null }) {
  return (
    <Card title="共用端末のPIN">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span>
          打刻時の本人確認：スタッフID <span className="font-mono font-bold">{staffCode}</span> ＋ PIN
        </span>
        {!status?.has_pin && <Badge tone="red">PIN未発行（打刻できません）</Badge>}
        {status?.has_pin && !status.locked_until && <Badge tone="green">発行済み</Badge>}
        {status?.must_change && <Badge tone="yellow">初回変更待ち</Badge>}
        {status?.locked_until && <Badge tone="red">ロック中（{formatJstDateTime(status.locked_until)} まで）</Badge>}
        {status?.pin_set_at && <span className="text-slate-500">最終発行 {formatJstDateTime(status.pin_set_at)}</span>}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ActionForm
          action={issuePin}
          submitLabel={status?.has_pin ? "ランダムなPINを再発行" : "ランダムなPINを発行"}
          confirmMessage={status?.has_pin ? "PINを再発行します。今のPINは使えなくなります。よろしいですか？" : undefined}
        >
          <input type="hidden" name="staff_id" value={staffId} />
          <input type="hidden" name="mode" value="random" />
          <p className="text-xs text-slate-500">6桁のPINを発行し、この画面に1回だけ表示します。</p>
        </ActionForm>
        <ActionForm action={issuePin} submitLabel="指定したPINを設定" tone="secondary">
          <input type="hidden" name="staff_id" value={staffId} />
          <input type="hidden" name="mode" value="manual" />
          <Field label="PIN（4〜8桁）" hint="同じ数字の繰り返し・連番は不可">
            <Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" autoComplete="off" required />
          </Field>
        </ActionForm>
        {status?.locked_until && (
          <ActionForm action={unlockPin} submitLabel="ロックを解除" tone="secondary">
            <input type="hidden" name="staff_id" value={staffId} />
            <p className="text-xs text-slate-500">本人確認のうえ解除してください（院長も解除できます）。</p>
          </ActionForm>
        )}
      </div>
    </Card>
  );
}
