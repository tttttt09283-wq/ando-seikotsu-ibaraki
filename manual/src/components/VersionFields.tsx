import { input, label } from "@/components/ui";
import { CATEGORIES, CLINICS, POSITION_LABEL, POSITIONS } from "@/lib/config";
import type { VersionRow } from "@/lib/repo/docs";

// 版の入力欄（提案・編集で共通）
export function VersionFields({ v }: { v?: Partial<VersionRow> }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={label} htmlFor="title">タイトル</label>
        <input id="title" name="title" className={input} defaultValue={v?.title} required maxLength={120} />
      </div>
      <div>
        <label className={label} htmlFor="body">内容</label>
        <textarea id="body" name="body" className={`${input} min-h-64 leading-relaxed`} defaultValue={v?.body} required maxLength={20000} />
        {v?.original_text && <p className="mt-1 text-xs text-neutral-500">原文は別に保存されていて、ここを編集しても変わりません。</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="category">カテゴリ</label>
          <select id="category" name="category" className={input} defaultValue={v?.category ?? "other"}>
            {CATEGORIES.map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="importance">重要度</label>
          <select id="importance" name="importance" className={input} defaultValue={v?.importance ?? "B"}>
            <option value="A">A（事故・法令・信用）</option><option value="B">B（運営の決まり）</option><option value="C">C（推奨・心構え）</option>
          </select>
        </div>
      </div>
      <fieldset>
        <legend className={label}>適用対象（選ばなければ全員）</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {POSITIONS.map((p) => (
            <label key={p} className="flex items-center gap-1.5"><input type="checkbox" name="targetPositions" value={p} defaultChecked={v?.target_positions?.includes(p)} className="size-4" />{POSITION_LABEL[p]}</label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={label}>適用店舗（選ばなければ全院）</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {CLINICS.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5"><input type="checkbox" name="targetClinics" value={c.id} defaultChecked={v?.target_clinics?.includes(c.id)} className="size-4" />{c.name}</label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="effectiveOn">施行日（空欄＝承認した日）</label>
          <input id="effectiveOn" name="effectiveOn" type="date" className={input} defaultValue={v?.effective_on ?? ""} />
        </div>
        <label className="flex items-end gap-2 pb-3 text-sm">
          <input type="checkbox" name="requiresReack" defaultChecked={v?.requires_reack ?? true} className="size-4" />公開時に対象スタッフへ再確認を求める
        </label>
      </div>
      <div>
        <label className={label} htmlFor="changeSummary">変更の理由・内容</label>
        <input id="changeSummary" name="changeSummary" className={input} defaultValue={v?.change_summary} maxLength={500} />
      </div>
    </div>
  );
}
