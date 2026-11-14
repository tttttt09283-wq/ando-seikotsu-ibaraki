import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCSV } from "./csv";
import { parseActualsCsv } from "./export";
import { guessMapping, parseList } from "./mandala-io";
import { MonthlyActualsSchema } from "../schemas";

const read = (f: string) => readFileSync(path.join(process.cwd(), "samples", f), "utf8");

describe("同梱サンプル CSV", () => {
  it("マンダラ一覧サンプルを取り込める", () => {
    const rows = parseCSV(read("mandala_list_sample.csv"));
    const { data, errors } = parseList(rows, guessMapping(rows[0]));
    expect(errors).toEqual([]);
    expect(data.center).toContain("1,200万円");
    expect(data.areas.find((a) => a.code === "A")?.actions.find((x) => x.position === 8)).toMatchObject({ kpi_target: 800000, due_date: "2030-06-30", priority: 1 });
  });
  it("月次実績サンプルを取り込める（見出しにない列は未入力）", () => {
    const { months, errors } = parseActualsCsv(parseCSV(read("monthly_actuals_sample.csv")));
    expect(errors).toEqual([]);
    expect(months).toHaveLength(3);
    for (const m of months) expect(MonthlyActualsSchema.safeParse(m).success).toBe(true);
    const nov = MonthlyActualsSchema.parse(months[2]);
    expect(nov.revenue.clinic_treatment).toBe(400000);
    expect(nov.revenue.ai_initial).toBeNull();
  });
});
