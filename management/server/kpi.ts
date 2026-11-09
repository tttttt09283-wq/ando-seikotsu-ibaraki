import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { KpiRow } from "@/lib/kpi";

export async function storeKpis(month: string): Promise<KpiRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_kpis", { p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return (data ?? []) as KpiRow[];
}
export async function lastJobRun() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("last_job_run");
  return ((data ?? []) as { job: string; started_at: string; finished_at: string | null; result: Record<string, unknown> | null; error: string | null }[])[0] ?? null;
}
