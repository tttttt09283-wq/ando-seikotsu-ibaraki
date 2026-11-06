import { BALANCE_TEMPLATE } from "@/lib/leave/import-balance";
import { STAFF_TEMPLATE } from "@/lib/import-staff";

// CSVのひな形（Excelで文字化けしないよう BOM 付き UTF-8）
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const body = kind === "staff" ? STAFF_TEMPLATE : BALANCE_TEMPLATE;
  const name = kind === "staff" ? "staff_template.csv" : "leave_balance_template.csv";
  return new Response("﻿" + body + "\r\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
