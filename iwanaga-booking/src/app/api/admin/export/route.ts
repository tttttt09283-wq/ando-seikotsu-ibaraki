import { getCurrentAdmin } from "@/lib/auth/admin";
import { AuthorizationError } from "@/lib/auth/permissions";
import { getRepo } from "@/lib/repo";
import { exportReservationsCsv } from "@/lib/services/export";
import { addDaysToKey, jstDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /api/admin/export?from=YYYY-MM-DD&to=YYYY-MM-DD&location= （管理者・CSV出力権限のみ） */
export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const u = new URL(req.url);
  const from = u.searchParams.get("from") ?? "";
  const to = u.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Bad Request", { status: 400 });
  try {
    const csv = await exportReservationsCsv(getRepo(), admin, {
      from: jstDateTime(from, "00:00").toISOString(),
      to: jstDateTime(addDaysToKey(to, 1), "00:00").toISOString(),
      locationId: u.searchParams.get("location") || undefined,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reservations_${from}_${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthorizationError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
}
