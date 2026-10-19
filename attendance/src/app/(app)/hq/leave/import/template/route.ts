import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS } from "@/lib/leave/import";
import { buildTemplate } from "@/lib/leave/import-file";

/** 有給残数の取込テンプレート（.xlsx）。本部のみ */
export async function GET() {
  const actor = await getActor();
  if (!actor || !isHq(actor)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const buffer = await buildTemplate(TEMPLATE_HEADERS, TEMPLATE_EXAMPLE);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("有給残数_取込テンプレート.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
