import { NextResponse, type NextRequest } from "next/server";
import { jstDate } from "@/lib/date";
import { toCSV } from "@/lib/io/csv";
import { actualsRows } from "@/lib/io/export";
import { exportGrid, exportList } from "@/lib/io/mandala-io";
import { exportBackup } from "@/lib/server/services";
import { getSession } from "@/lib/server/session";
import { loadSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

function file(body: string, name: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s.ok) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const { store } = s.session;
  const type = req.nextUrl.searchParams.get("type") ?? "";
  const d = jstDate().replace(/-/g, "");
  const snap = await loadSnapshot(store);
  switch (type) {
    case "mandala-list":
      return file(toCSV(exportList(snap.goals, snap.actions)), `mandala_list_${d}.csv`, "text/csv; charset=utf-8");
    case "mandala-grid":
      return file(toCSV(exportGrid(snap.goals, snap.actions)), `mandala_9x9_${d}.csv`, "text/csv; charset=utf-8");
    case "tasks": {
      const code = new Map(snap.actions.map((a) => [a.id, `${snap.goals.find((g) => g.id === a.goal_id)?.code ?? ""}${a.position}`]));
      const rows = [["タスク名", "目的", "マンダラ", "階層", "開始日", "期限", "所要時間(分)", "実績時間(分)", "優先順位", "ステータス", "成果物", "完了条件", "完了日"]];
      for (const t of snap.tasks.sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9")))
        rows.push([t.title, t.purpose, t.mandala_action_id ? code.get(t.mandala_action_id) ?? "" : "", t.level, t.start_date ?? "", t.due_date ?? "", String(t.estimate_minutes), t.actual_minutes == null ? "" : String(t.actual_minutes), String(t.priority), t.status, t.deliverable, t.done_criteria, t.completed_at ?? ""]);
      return file(toCSV(rows), `tasks_${d}.csv`, "text/csv; charset=utf-8");
    }
    case "actuals":
      return file(toCSV(actualsRows(snap)), `monthly_actuals_${d}.csv`, "text/csv; charset=utf-8");
    case "reviews": {
      const rows = [["週の開始日", "施術売上", "AI売上", "新規顧客", "継続顧客", "AI契約数", "タスク達成数", "労働時間", "家族時間", "できたこと", "課題", "来週の重点"]];
      for (const r of snap.reviews.sort((a, b) => a.week_start.localeCompare(b.week_start)))
        rows.push([r.week_start, String(r.clinic_revenue), String(r.ai_revenue), String(r.new_customers), String(r.returning_customers), String(r.ai_contracts), String(r.tasks_done), String(r.work_hours), String(r.family_hours), r.wins, r.issues, r.next_focus]);
      return file(toCSV(rows), `weekly_reviews_${d}.csv`, "text/csv; charset=utf-8");
    }
    case "backup": {
      const b = await exportBackup(store);
      await store.logEvent("export", "all", { tables: Object.keys(b.data).length });
      return file(JSON.stringify(b, null, 2), `freedom-os_backup_${d}.json`, "application/json; charset=utf-8");
    }
    default:
      return NextResponse.json({ error: "type が不正です" }, { status: 400 });
  }
}
