/**
 * このアプリが動かす会社の設定。
 * 別の会社に導入するときは tenants/ に設定フォルダを作り、ここの import 先を差し替える。
 */
import enejoyHand from "./tenants/enejoy-hand";
import type { Member, TenantConfig } from "./lib/tenant-types";

export const TENANT: TenantConfig = enejoyHand;

const byId = new Map(TENANT.members.map((m) => [m.id, m]));

export function getMember(id: string): Member | undefined {
  return byId.get(id);
}

export function memberName(id: string): string {
  return byId.get(id)?.name ?? id;
}

export const PRESIDENT_ID = TENANT.people.presidentId;
export const OPERATOR_ID = TENANT.people.operatorId;
export const COMMANDER_ID = TENANT.people.commanderId;

/** 承認者の役割から人の id へ */
export function approverMemberId(role: "operator" | "president"): string {
  return role === "president" ? PRESIDENT_ID : OPERATOR_ID;
}
