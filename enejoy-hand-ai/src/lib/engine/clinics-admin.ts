import { getClinics } from "@/lib/clinics";
import { TENANT } from "@/tenant";
import { audit, EngineError, newId, type EngineDeps } from "./engine";

/**
 * 院の設定（店舗展開・閉院）。院の一覧・開院月・閉院月は予算・数字・口コミのすべてに反映される。
 * 予算の確定は別途承認が必要なので、ここでは院の情報だけを変える（操作は監査ログに残す）。
 */

const monthOk = (m?: string | null) => m == null || /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export async function addClinic(
  deps: EngineDeps,
  actorId: string,
  input: { name: string; short?: string; openedMonth?: string; tags?: string[]; aliases?: string[] },
) {
  if (!monthOk(input.openedMonth)) throw new EngineError("開院月が正しくありません", "INVALID_STATE");
  return deps.store.transact((data) => {
    const name = input.name.trim();
    const short = (input.short?.trim() || name.replace(/院$/, "")).trim();
    if (getClinics(data).some((c) => c.name === name || c.short === short)) {
      throw new EngineError(`「${name}」はすでにあります`, "INVALID_STATE");
    }
    const clinic = {
      id: newId("cln"),
      name,
      short,
      aliases: [...new Set([short, ...(input.aliases ?? [])].filter(Boolean))],
      openedMonth: input.openedMonth || undefined,
      tags: input.tags?.length ? input.tags : undefined,
    };
    data.clinicSetup.added.push(clinic);
    audit(data, deps.now(), actorId, "clinic.add", `${name}（${input.openedMonth ?? "開院月未定"}開院）`);
    return clinic;
  });
}

/** 開院月・閉院月の変更（null で設定を外す） */
export async function updateClinic(
  deps: EngineDeps,
  actorId: string,
  input: { id: string; openedMonth?: string | null; closedMonth?: string | null },
) {
  if (!monthOk(input.openedMonth) || !monthOk(input.closedMonth)) throw new EngineError("月の指定が正しくありません", "INVALID_STATE");
  await deps.store.transact((data) => {
    const added = data.clinicSetup.added.find((c) => c.id === input.id);
    const base = TENANT.clinics.find((c) => c.id === input.id);
    if (!added && !base) throw new EngineError("院が見つかりません", "NOT_FOUND");
    const opened = input.openedMonth !== undefined ? input.openedMonth : getClinics(data).find((c) => c.id === input.id)?.openedMonth;
    const closed = input.closedMonth !== undefined ? input.closedMonth : getClinics(data).find((c) => c.id === input.id)?.closedMonth;
    if (opened && closed && closed < opened) throw new EngineError("閉院（最終営業月）は開院月以降にしてください", "INVALID_STATE");
    if (added) {
      if (input.openedMonth !== undefined) added.openedMonth = input.openedMonth ?? undefined;
      if (input.closedMonth !== undefined) added.closedMonth = input.closedMonth ?? undefined;
    } else {
      const o = (data.clinicSetup.overrides[input.id] ??= {});
      if (input.openedMonth !== undefined) o.openedMonth = input.openedMonth;
      if (input.closedMonth !== undefined) o.closedMonth = input.closedMonth;
    }
    const name = (added ?? base)!.name;
    audit(data, deps.now(), actorId, "clinic.update", `${name}：開院 ${opened ?? "—"}／閉院 ${closed ?? "—"}`);
  });
}

/** 画面から追加した院の削除（数字・予算・口コミの記録がない場合のみ。記録があれば閉院月を設定する） */
export async function removeClinic(deps: EngineDeps, actorId: string, id: string) {
  await deps.store.transact((data) => {
    const c = data.clinicSetup.added.find((x) => x.id === id);
    if (!c) throw new EngineError("設定ファイルの院は削除できません。閉院（最終営業月）を設定してください", "INVALID_STATE");
    const used =
      data.clinicMonths.some((r) => r.clinicId === id) ||
      (data.budget.confirmed?.cells ?? []).some((x) => x.clinicId === id) ||
      data.budget.history.some((v) => v.cells.some((x) => x.clinicId === id)) ||
      data.reputation.reviews.some((r) => r.clinicId === id);
    if (used) throw new EngineError("この院には数字・確定予算・口コミの記録があるため削除できません。閉院（最終営業月）を設定してください", "INVALID_STATE");
    data.clinicSetup.added = data.clinicSetup.added.filter((x) => x.id !== id);
    if (data.budget.draft) data.budget.draft.cells = data.budget.draft.cells.filter((x) => x.clinicId !== id);
    audit(data, deps.now(), actorId, "clinic.remove", c.name);
  });
}
