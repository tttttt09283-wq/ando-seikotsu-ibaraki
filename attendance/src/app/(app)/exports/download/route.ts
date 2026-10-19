import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/auth/session";
import { isHq, managedClinicIds } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { EXPORT_FORMATS, renderExport, type ExportFormat } from "@/lib/export/format";
import { buildReport, reportById } from "@/lib/export/reports";
import { isValidMonth } from "@/lib/time/jst";

const isFormat = (v: string | null): v is ExportFormat => v !== null && v in EXPORT_FORMATS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 帳票のダウンロード（CSV UTF-8 / CSV Shift_JIS / Excel）。
 * 本部は全帳票・全院、院長は勤怠系の帳票を担当院の分だけ。出力した記録を監査ログに残す。
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = request.nextUrl.searchParams;
  const report = reportById(q.get("report") ?? "");
  const format = q.get("format");
  const month = q.get("month") ?? "";
  const clinic = q.get("clinic") || null;
  if (!report || !isFormat(format) || !isValidMonth(month) || (clinic && !UUID.test(clinic))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const hq = isHq(actor);
  const managed = managedClinicIds(actor);
  if ((report.hqOnly && !hq) || (!hq && managed.length === 0) || (!hq && clinic && !managed.includes(clinic))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createSupabaseServer();
  let table;
  try {
    table = await buildReport(supabase, actor, report.id, { month, clinicId: clinic });
  } catch (error) {
    console.error("export failed", report.id, error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
  const { error: logError } = await supabase.rpc("log_export", {
    p_report: report.id,
    p_params: { month, clinic, format },
    p_rows: table.rows.length,
  });
  if (logError) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await renderExport(table, format);
  const info = EXPORT_FORMATS[format];
  const fileName = `${table.title}.${info.extension}`;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": info.contentType,
      "Content-Disposition": `attachment; filename="export.${info.extension}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
