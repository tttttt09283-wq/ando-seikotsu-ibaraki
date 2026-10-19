import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJpDate } from "@/lib/cash/dates";
import { yen } from "@/lib/cash/money";
import { DEFAULT_SCENARIOS, describeAssumptions } from "@/lib/cash/scenarios";
import type { ScenarioKind } from "@/lib/cash/types";
import { requireOrg } from "@/lib/data";
import { forecastFor, resolveScope } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export const metadata = { title: "資金予測" };

const KINDS: ScenarioKind[] = ["conservative", "standard", "optimistic"];
const HORIZONS = [7, 30, 90, 180];

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { data, today } = await requireOrg();
  const { scope, label, value } = resolveScope(data, (await searchParams).scope);
  const results = KINDS.map((k) => ({ kind: k, ...DEFAULT_SCENARIOS[k], r: forecastFor(data, today, scope, k) }));
  const base = results[1].r;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">資金予測（3シナリオ）</h1>
          <p className="text-muted-foreground text-sm">
            {formatJpDate(today)}・{label}・起点は口座の基準残高＋その後の確定取引（{yen(base.currentBalance)}）。以降はすべて予測値です。
          </p>
        </div>
        {data.branches.length > 0 && (
          <nav className="flex flex-wrap gap-1" aria-label="表示する範囲">
            {[{ id: "all", name: "企業全体" }, ...data.branches.filter((b) => b.is_active)].map((b) => (
              <Link
                key={b.id}
                href={b.id === "all" ? "/forecast" : `/forecast?scope=${b.id}`}
                aria-current={value === b.id ? "page" : undefined}
                className={cn("rounded-full px-3 py-1.5 text-sm", value === b.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
              >
                {b.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <Card>
        <CardContent className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-2 text-left text-xs font-medium" />
                {results.map((x) => (
                  <th key={x.kind} scope="col" className={cn("px-2 py-2 text-right", x.kind === "standard" && "bg-brand/5")}>
                    {x.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HORIZONS.map((h) => (
                <tr key={h} className="border-b">
                  <th scope="row" className="py-2 text-left text-xs font-medium">
                    {h}日後の予測残高
                  </th>
                  {results.map((x) => {
                    const v = x.r.balanceAt(h);
                    return (
                      <td key={x.kind} className={cn("px-2 py-2 text-right tabular-nums", x.kind === "standard" && "bg-brand/5", v != null && v < 0 && "text-bad font-semibold")}>
                        {v != null ? yen(v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-b">
                <th scope="row" className="py-2 text-left text-xs font-medium">最も少ない日（180日）</th>
                {results.map((x) => (
                  <td key={x.kind} className={cn("px-2 py-2 text-right tabular-nums", x.kind === "standard" && "bg-brand/5")}>
                    {yen(x.r.lowest.balance)}
                    <span className="text-muted-foreground block text-xs">{formatJpDate(x.r.lowest.date, false)}</span>
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <th scope="row" className="py-2 text-left text-xs font-medium">資金不足予測日</th>
                {results.map((x) => (
                  <td key={x.kind} className={cn("px-2 py-2 text-right", x.kind === "standard" && "bg-brand/5", x.r.shortfall && "text-bad font-semibold")}>
                    {x.r.shortfall ? formatJpDate(x.r.shortfall.date) : "なし"}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="py-2 text-left text-xs font-medium">最低必要残高割れ</th>
                {results.map((x) => (
                  <td key={x.kind} className={cn("px-2 py-2 text-right", x.kind === "standard" && "bg-brand/5")}>
                    {x.r.minBalance <= 0 ? "未設定" : x.r.minBalanceBreach ? `${formatJpDate(x.r.minBalanceBreach.date, false)}（−${yen(x.r.minBalanceBreach.gap)}）` : "なし"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {results.map((x) => (
          <Card key={x.kind}>
            <CardHeader>
              <div>
                <CardTitle>{x.name}の仮定</CardTitle>
                <CardDescription>予測は仮定にもとづく計算で、実績ではありません。</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {describeAssumptions(x.assumptions).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">シナリオの仮定の編集、入金遅延・大口支払の感度分析は次のフェーズで追加します。</p>
    </div>
  );
}
