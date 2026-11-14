// CSV 書き出し用の表を作る（純粋関数）
import type { Snapshot } from "../types";

export const ACTUALS_HEADER = [
  "月",
  "施術売上",
  "施術その他売上",
  "AI初期導入売上",
  "AI月額売上",
  "AI商品売上",
  "AIその他売上",
  "施術_消耗品費",
  "施術_広告費",
  "施術_決済手数料",
  "施術_家賃",
  "施術_設備費",
  "施術_その他経費",
  "AI_サーバー費",
  "AI_API利用料",
  "AI_外注費",
  "AI_その他経費",
  "共通_広告費",
  "共通_その他経費",
  "施術件数",
  "新患数",
  "継続患者数",
  "キャンセル数",
  "予約枠数",
  "営業日数",
  "問い合わせ数",
  "SNS流入数",
  "紹介数",
  "AI新規契約",
  "AI継続契約",
  "AI解約",
  "商品販売数",
  "保守時間",
  "開発時間",
  "本業手取り",
  "その他収入",
  "生活費",
  "生活防衛資金残高",
] as const;

/** 列名 → 月次実績フォームのキー（取り込みにも使う） */
export const ACTUALS_KEYS: string[] = [
  "month",
  "revenue.clinic_treatment",
  "revenue.clinic_other",
  "revenue.ai_initial",
  "revenue.ai_recurring",
  "revenue.ai_product",
  "revenue.ai_other",
  "expenses.clinic_consumables",
  "expenses.clinic_advertising",
  "expenses.clinic_payment_fees",
  "expenses.clinic_rent",
  "expenses.clinic_equipment",
  "expenses.clinic_other",
  "expenses.ai_server",
  "expenses.ai_ai_api",
  "expenses.ai_outsourcing",
  "expenses.ai_other",
  "expenses.common_advertising",
  "expenses.common_other",
  "clinic.sessions",
  "clinic.new_patients",
  "clinic.active_patients",
  "clinic.cancellations",
  "clinic.available_slots",
  "clinic.work_days",
  "clinic.inquiries",
  "clinic.sns_inflow",
  "clinic.referrals",
  "ai.new_contracts",
  "ai.active_contracts",
  "ai.churned_contracts",
  "ai.products_sold",
  "ai.maintenance_hours",
  "ai.dev_hours",
  "household.employment_income_net",
  "household.other_income",
  "household.living_cost",
  "household.emergency_fund_balance",
];

/** 月次実績を1か月1行のフォーム値（空欄は ""）に戻す */
export function actualsFormValues(s: Snapshot, month: string): Record<string, Record<string, string | number>> & { month: string } {
  const v = (n: number | null | undefined) => (n == null ? "" : n);
  const rev = (b: string, c: string) => v(s.revenue.find((r) => r.month === month && r.business === b && r.category === c)?.amount);
  const exp = (b: string, c: string) => v(s.expenses.find((r) => r.month === month && r.business === b && r.category === c)?.amount);
  const cm = s.clinicMetrics.find((r) => r.month === month);
  const am = s.aiMetrics.find((r) => r.month === month);
  const hh = s.household.find((r) => r.month === month);
  return {
    month,
    revenue: { clinic_treatment: rev("clinic", "treatment"), clinic_other: rev("clinic", "other"), ai_initial: rev("ai", "initial"), ai_recurring: rev("ai", "recurring"), ai_product: rev("ai", "product"), ai_other: rev("ai", "other") },
    expenses: {
      clinic_consumables: exp("clinic", "consumables"),
      clinic_advertising: exp("clinic", "advertising"),
      clinic_payment_fees: exp("clinic", "payment_fees"),
      clinic_rent: exp("clinic", "rent"),
      clinic_equipment: exp("clinic", "equipment"),
      clinic_other: exp("clinic", "other"),
      ai_server: exp("ai", "server"),
      ai_ai_api: exp("ai", "ai_api"),
      ai_outsourcing: exp("ai", "outsourcing"),
      ai_other: exp("ai", "other"),
      common_advertising: exp("common", "advertising"),
      common_other: exp("common", "other"),
    },
    clinic: {
      sessions: v(cm?.sessions),
      new_patients: v(cm?.new_patients),
      active_patients: v(cm?.active_patients),
      cancellations: v(cm?.cancellations),
      available_slots: v(cm?.available_slots),
      work_days: v(cm?.work_days),
      inquiries: v(cm?.inquiries),
      sns_inflow: v(cm?.sns_inflow),
      referrals: v(cm?.referrals),
    },
    ai: {
      new_contracts: v(am?.new_contracts),
      active_contracts: v(am?.active_contracts),
      churned_contracts: v(am?.churned_contracts),
      products_sold: v(am?.products_sold),
      maintenance_hours: v(am?.maintenance_hours),
      dev_hours: v(am?.dev_hours),
    },
    household: {
      employment_income_net: v(hh?.employment_income_net),
      other_income: v(hh?.other_income),
      living_cost: v(hh?.living_cost),
      emergency_fund_balance: v(hh?.emergency_fund_balance),
      note: hh?.note ?? "",
    },
  } as never;
}

export function actualsRows(s: Snapshot): (string | number)[][] {
  const months = [...new Set([...s.revenue, ...s.expenses, ...s.clinicMetrics, ...s.aiMetrics, ...s.household].map((r) => r.month))].sort();
  return [
    [...ACTUALS_HEADER],
    ...months.map((m) => {
      const f = actualsFormValues(s, m) as unknown as Record<string, Record<string, string | number>>;
      return ACTUALS_KEYS.map((k) => {
        if (k === "month") return m.slice(0, 7);
        const [g, key] = k.split(".");
        return f[g]?.[key] ?? "";
      });
    }),
  ];
}

/** 取り込み：見出し行の列名から各月のフォーム値を作る */
export function parseActualsCsv(rows: string[][]): { months: Record<string, unknown>[]; errors: string[] } {
  const errors: string[] = [];
  const header = rows[0]?.map((h) => h.trim()) ?? [];
  const colOf = new Map<string, number>();
  ACTUALS_HEADER.forEach((h, i) => {
    const idx = header.indexOf(h);
    if (idx >= 0) colOf.set(ACTUALS_KEYS[i], idx);
  });
  if (!colOf.has("month")) return { months: [], errors: ["1列目の見出し「月」が見つかりません（書き出したCSVの形式で取り込んでください）"] };
  const out: Record<string, unknown>[] = [];
  rows.slice(1).forEach((r, i) => {
    const raw = (r[colOf.get("month")!] ?? "").trim();
    const mm = raw.match(/^(\d{4})[-/年](\d{1,2})/);
    if (!mm) {
      if (r.some((c) => c.trim())) errors.push(`${i + 2}行目：月「${raw}」を読めません`);
      return;
    }
    const month = `${mm[1]}-${mm[2].padStart(2, "0")}-01`;
    const form: Record<string, Record<string, string> | string> = { month, revenue: {}, expenses: {}, clinic: {}, ai: {}, household: { note: "" } };
    for (const k of ACTUALS_KEYS.slice(1)) {
      const [g, key] = k.split(".");
      const idx = colOf.get(k);
      (form[g] as Record<string, string>)[key] = idx == null ? "" : (r[idx] ?? "").replace(/[,，円¥\s]/g, "");
    }
    out.push(form);
  });
  return { months: out, errors };
}
