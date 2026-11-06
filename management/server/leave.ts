import "server-only";
import { createClient } from "@/lib/supabase/server";
import { jstToday } from "@/lib/time";
import type { Balance, FiveDay, GrantState, LeaveTypeCode } from "@/lib/leave/types";

export type LeaveOverview = { balances: Record<"PAID" | "SHIFT" | "SHIFT_HOLIDAY", Balance & { grants: GrantState[] }>; fiveDay: FiveDay };

// 本人・院長などが見る残数（見る権限が無ければ DB がエラーにする）
export async function getLeaveOverview(userId: string, asOf = jstToday()): Promise<LeaveOverview> {
  const supabase = await createClient();
  const types: ("PAID" | "SHIFT" | "SHIFT_HOLIDAY")[] = ["PAID", "SHIFT", "SHIFT_HOLIDAY"];
  const [bals, five] = await Promise.all([
    Promise.all(types.map((t) => supabase.rpc("leave_balance", { p_user: userId, p_type_code: t, p_as_of: asOf }))),
    supabase.rpc("five_day_status", { p_user: userId, p_as_of: asOf }),
  ]);
  const err = bals.find((b) => b.error)?.error ?? five.error;
  if (err) throw new Error(err.message);
  const num = (b: Record<string, unknown>) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && k !== "as_of" ? Number(v) : v]));
  const balances = Object.fromEntries(types.map((t, i) => {
    const b = bals[i].data as Record<string, unknown>;
    return [t, { ...num(b), grants: ((b.grants as Record<string, unknown>[]) ?? []).map((g) => num(g)) }];
  })) as LeaveOverview["balances"];
  return { balances, fiveDay: five.data as FiveDay };
}

export type StoreLeaveRow = {
  user_id: string; name: string; role_code: string; employment_type: string; hire_date: string | null;
  paid: Balance; shift: Balance; shift_holiday: Balance; five_day: FiveDay;
};
export async function getStoreLeave(storeId: string, asOf = jstToday()): Promise<StoreLeaveRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_leave_summary", { p_store: storeId, p_as_of: asOf });
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreLeaveRow[];
}

export const TYPE_ORDER: LeaveTypeCode[] = ["PAID", "SHIFT", "SHIFT_HOLIDAY"];
