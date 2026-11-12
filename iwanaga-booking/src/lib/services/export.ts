/**
 * CSV 出力（権限：export。許可された管理主体の予約だけ。出力は監査ログに残す）
 * 相談内容は出力しない（必要最小限）。
 */
import "server-only";
import { assertPermission, type AdminContext } from "../auth/permissions";
import { decrypt } from "../crypto";
import { STATUS_SHORT } from "../domain/status";
import type { ControllerId } from "../domain/types";
import type { Repo } from "../repo/types";
import { jstDateKey, jstTime } from "../time";

/** Excel 等での数式実行（CSV インジェクション）を防ぐ */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportReservationsCsv(repo: Repo, admin: AdminContext | null, f: { from: string; to: string; locationId?: string }) {
  assertPermission(admin, "export");
  const locations = await repo.listLocations();
  const allowed = locations.filter((l) => admin.allowed_controllers.includes(l.controller) && (!f.locationId || l.id === f.locationId));
  if (f.locationId && allowed.length === 0) assertPermission(admin, "export", locations.find((l) => l.id === f.locationId)?.controller as ControllerId);
  const rows = await repo.searchReservations({ from: f.from, to: f.to, locationIds: allowed.map((l) => l.id), controllers: admin.allowed_controllers, limit: 5000 });
  const header = ["予約番号", "施術場所", "管理主体", "ステータス", "日付", "開始", "終了", "メニュー", "施術時間(分)", "料金(税込)", "氏名", "電話番号", "LINE受付", "通知", "申込日時", "流入元"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const c = await repo.getCustomer(r.customer_id);
    const loc = locations.find((l) => l.id === r.location_id);
    lines.push(
      [
        r.code,
        loc?.name,
        loc?.controller_name,
        STATUS_SHORT[r.status],
        jstDateKey(r.start_at),
        jstTime(r.start_at),
        jstTime(r.end_at),
        r.service_snapshot.name,
        r.service_snapshot.duration_minutes,
        r.service_snapshot.price_tax_included,
        c && !c.anonymized_at ? decrypt(c.name_enc) : "（削除済み）",
        c && !c.anonymized_at ? decrypt(c.phone_enc) : "",
        r.line_received_at ? (r.line_match_method === "manual" ? "手動照合" : "確認済み") : "未確認",
        r.notice_status,
        `${jstDateKey(r.created_at)} ${jstTime(r.created_at)}`,
        r.source ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  await repo.addAudit({
    actor_type: "admin",
    actor_id: admin.email,
    controller: null,
    location_id: f.locationId ?? null,
    reservation_id: null,
    action: "csv_exported",
    from_status: null,
    to_status: null,
    detail: { from: f.from, to: f.to, location: f.locationId ?? "all", count: rows.length, controllers: admin.allowed_controllers },
  });
  // Excel で文字化けしないよう BOM を付ける
  return "﻿" + lines.join("\r\n") + "\r\n";
}
