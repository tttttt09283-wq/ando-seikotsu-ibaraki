import { z } from "zod";
import type { KitPinState } from "./workbook";

/** 使い始めセットの作成フォーム */
export const kitRequestSchema = z.object({
  clinic_id: z.uuid(),
  device_mode: z.enum(["new", "none"]),
  device_name: z.string().trim().min(1).max(40).default("受付タブレット"),
  valid_days: z.coerce.number().int().min(1).max(7).default(7),
  pin_mode: z.enum(["missing", "all", "none"]),
});
export type KitRequest = z.infer<typeof kitRequestSchema>;

export interface OverviewRow {
  staff_id: string;
  staff_code: string;
  family_name: string;
  given_name: string;
  has_pin: boolean;
}

/** PIN を発行するスタッフ。missing：未発行の人だけ／all：全員（今のPINは使えなくなる）／none：発行しない */
export function staffToIssue(rows: OverviewRow[], mode: KitRequest["pin_mode"]): OverviewRow[] {
  if (mode === "all") return rows;
  if (mode === "missing") return rows.filter((r) => !r.has_pin);
  return [];
}

export function pinStateOf(row: OverviewRow, issued: boolean): KitPinState {
  if (issued) return "issued";
  return row.has_pin ? "existing" : "none";
}

/** 端末の登録コードを、同じ院・同じ名前の「登録待ち」の端末があればそれに出し直す（作り直すたびに端末が増えないように） */
export function reusableDeviceId(
  devices: { device_id: string; clinic_id: string; name: string; status: string }[],
  clinicId: string,
  name: string,
): string | null {
  return devices.find((d) => d.clinic_id === clinicId && d.status === "pending" && d.name === name)?.device_id ?? null;
}
