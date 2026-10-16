import type { Clinic } from "@/lib/tenant-types";
import type { CompanyData } from "@/lib/types";
import { TENANT } from "@/tenant";

/**
 * 今の院の一覧：設定ファイルの院（開院月・閉院月の変更を反映）＋画面から追加した院（店舗展開）。
 * 院の一覧が必要なところは、TENANT.clinics ではなくこれを使う。
 */
export function getClinics(data: Pick<CompanyData, "clinicSetup">): Clinic[] {
  const setup = data.clinicSetup ?? { added: [], overrides: {} };
  const base = TENANT.clinics.map((c) => {
    const o = setup.overrides[c.id];
    if (!o) return c;
    return {
      ...c,
      openedMonth: o.openedMonth === undefined ? c.openedMonth : (o.openedMonth ?? undefined),
      closedMonth: o.closedMonth === undefined ? c.closedMonth : (o.closedMonth ?? undefined),
    };
  });
  return [...base, ...setup.added.map((c) => ({ ...c, added: true }))];
}

/** その月に営業している院か（開院月以降・閉院月まで） */
export function clinicOpenIn(c: Pick<Clinic, "openedMonth" | "closedMonth">, month: string): boolean {
  return (!c.openedMonth || month >= c.openedMonth) && (!c.closedMonth || month <= c.closedMonth);
}
