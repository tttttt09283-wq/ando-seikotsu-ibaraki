import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { toCsv } from "@/lib/csv/export";
import { createClient } from "@/lib/db/server";
import { isSameOrigin } from "@/lib/origin";

const CONTACT: Record<string, string> = { unknown: "未確認", allowed: "同意", not_allowed: "不可", unsubscribed: "配信停止" };

export async function POST(request: Request, { params }: RouteContext<"/api/o/[orgSlug]/export/customers">) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const { orgSlug } = await params;
  let ctx;
  try {
    ctx = await getOrgContext(orgSlug);
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (!can(ctx.memberships, "customer.export", null)) return new NextResponse("Not Found", { status: 404 });

  const supabase = await createClient();
  const rows: unknown[][] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("customer_overview")
      .select("customer_code, family_name, given_name, family_name_kana, given_name_kana, phone, email, store_id, contact_status, first_visit_on, last_visit_on, next_appointment_at")
      .eq("organization_id", ctx.org.id)
      .order("customer_code")
      .range(from, from + PAGE - 1);
    if (error) return new NextResponse("Error", { status: 500 });
    for (const c of data ?? []) {
      rows.push([
        c.customer_code,
        c.family_name,
        c.given_name,
        c.family_name_kana,
        c.given_name_kana,
        c.phone,
        c.email,
        ctx.stores.find((s) => s.id === c.store_id)?.code ?? "",
        CONTACT[c.contact_status ?? "unknown"],
        c.first_visit_on,
        c.last_visit_on,
        c.next_appointment_at,
      ]);
    }
    if (!data || data.length < PAGE) break;
  }
  await supabase.rpc("log_audit_event", {
    org: ctx.org.id,
    p_action: "customer.exported",
    p_entity_type: "customers",
    p_details: { rows: rows.length },
  });

  const csv = toCsv(
    ["顧客番号", "姓", "名", "セイ", "メイ", "電話番号", "メールアドレス", "店舗コード", "連絡同意", "初回来店日", "最終来店日", "次回予約"],
    rows,
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
