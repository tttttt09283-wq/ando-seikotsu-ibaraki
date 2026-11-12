/**
 * 管理画面の一覧・検索・ダッシュボード用の取得処理（閲覧権限のある管理主体の予約だけ返す）。
 */
import "server-only";
import { assertPermission, type AdminContext } from "../auth/permissions";
import { decrypt, lookupHash } from "../crypto";
import type { Reservation, ReservationStatus } from "../domain/types";
import { normalizePhone } from "../domain/validation";
import type { Repo, ReservationFilter } from "../repo/types";
import { addDaysToKey, jstDateKey, jstDateTime, jstWeekday } from "../time";

export interface AdminRow extends Reservation {
  customer_name: string;
  location_short: string;
}

export async function listForAdmin(repo: Repo, admin: AdminContext | null, f: ReservationFilter): Promise<AdminRow[]> {
  assertPermission(admin, "view");
  const locations = await repo.listLocations();
  const rows = await repo.searchReservations({ ...f, controllers: admin.allowed_controllers });
  const cache = new Map<string, string>();
  const out: AdminRow[] = [];
  for (const r of rows) {
    if (!cache.has(r.customer_id)) {
      const c = await repo.getCustomer(r.customer_id);
      cache.set(r.customer_id, c && !c.anonymized_at ? safeDecrypt(c.name_enc) : "（削除済み）");
    }
    out.push({ ...r, customer_name: cache.get(r.customer_id)!, location_short: locations.find((l) => l.id === r.location_id)?.short_name ?? r.location_id });
  }
  return out;
}

function safeDecrypt(v: string) {
  try {
    return decrypt(v);
  } catch {
    return "（復号できません）";
  }
}

export function rangeFor(kind: "today" | "week" | "month", now: Date) {
  const today = jstDateKey(now);
  if (kind === "today") return { from: jstDateTime(today, "00:00").toISOString(), to: jstDateTime(addDaysToKey(today, 1), "00:00").toISOString() };
  if (kind === "week") {
    const monday = addDaysToKey(today, -((jstWeekday(today) + 6) % 7));
    return { from: jstDateTime(monday, "00:00").toISOString(), to: jstDateTime(addDaysToKey(monday, 7), "00:00").toISOString() };
  }
  const first = `${today.slice(0, 7)}-01`;
  const [y, m] = first.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: jstDateTime(first, "00:00").toISOString(), to: jstDateTime(next, "00:00").toISOString() };
}

export async function dashboard(repo: Repo, admin: AdminContext | null, now: Date) {
  assertPermission(admin, "view");
  const pending = await listForAdmin(repo, admin, { statuses: ["pending_line", "pending_review", "change_proposed"], limit: 500 });
  const upcomingConfirmed = await listForAdmin(repo, admin, { statuses: ["confirmed"], from: now.toISOString(), limit: 500 });
  const failedNotices = upcomingConfirmed.concat(pending).filter((r) => r.notice_status === "failed" || r.notice_status === "manual_required");
  const notes = (await repo.listNotifications({ recipient: "admin", controllers: admin.allowed_controllers, limit: 50 })).filter((n) => n.channel === "admin_panel");
  return {
    counts: {
      pending_line: pending.filter((r) => r.status === "pending_line").length,
      pending_review: pending.filter((r) => r.status === "pending_review").length,
      change_proposed: pending.filter((r) => r.status === "change_proposed").length,
      confirmed: upcomingConfirmed.length,
      notice_issues: failedNotices.length,
    },
    pending,
    failedNotices,
    unread: notes.filter((n) => !n.read_at),
  };
}

export interface SearchForm {
  code?: string;
  phone?: string;
  name?: string;
  status?: string;
  location?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
}

export async function searchForAdmin(repo: Repo, admin: AdminContext | null, q: SearchForm) {
  assertPermission(admin, "view");
  const f: ReservationFilter = { limit: 500 };
  if (q.code) f.code = q.code.trim().toUpperCase();
  if (q.status) f.statuses = [q.status as ReservationStatus];
  if (q.location) f.locationIds = [q.location];
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) f.from = jstDateTime(q.from, "00:00").toISOString();
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) f.to = jstDateTime(addDaysToKey(q.to, 1), "00:00").toISOString();
  if (q.phone) {
    // 電話番号は暗号化しているため、ハッシュで完全一致検索
    const customers = await repo.findCustomersByPhoneHash(lookupHash("phone", normalizePhone(q.phone)));
    f.customerIds = customers.map((c) => c.id);
    if (f.customerIds.length === 0) return [];
  }
  let rows = await listForAdmin(repo, admin, f);
  if (q.name?.trim()) {
    const needle = q.name.trim().replace(/\s/g, "");
    rows = rows.filter((r) => r.customer_name.replace(/\s/g, "").includes(needle));
  }
  return rows;
}
