import type { TenantConfig } from "@/lib/tenant-types";
import type { KpiDef } from "@/lib/types";

/**
 * Enejoy Hand の標準の管理項目（KPI）。画面の「管理項目」で追加・変更できる。
 * 系列の key は日計表の指標（numbers.ts の METRICS）か、budget / staff / lastYearSales。
 */
export const KPIS: KpiDef[] = [
  {
    id: "sales",
    name: "売上",
    unit: "yen",
    calc: { kind: "series", key: "salesActual" },
    direction: "up",
    target: { kind: "series", key: "budget" },
    note: "目標は院別の確定予算",
  },
  {
    id: "budgetRate",
    name: "予算達成率",
    unit: "percent",
    calc: { kind: "ratio", numerator: "salesActual", denominator: "budget" },
    direction: "up",
    target: { kind: "value", value: 100 },
  },
  {
    id: "yoy",
    name: "昨対比（前年同月比）",
    unit: "percent",
    calc: { kind: "ratio", numerator: "salesActual", denominator: "lastYearSales" },
    direction: "up",
    target: { kind: "value", value: 105 },
    note: "既存店成長率105%を目安",
  },
  {
    id: "perStaff",
    name: "施術者1人あたり売上",
    unit: "yen",
    calc: { kind: "ratio", numerator: "salesActual", denominator: "staff" },
    direction: "up",
    target: { kind: "value", value: 1_000_000 },
    note: "月100万円超えを目安",
  },
  { id: "staff", name: "施術者数（換算）", unit: "person", calc: { kind: "series", key: "staff" }, direction: "up" },
  { id: "newPatients", name: "新患数", unit: "count", calc: { kind: "series", key: "newPatients" }, direction: "up" },
  { id: "totalVisits", name: "総来院数", unit: "count", calc: { kind: "series", key: "totalVisits" }, direction: "up" },
  {
    id: "unitPrice",
    name: "来院1回あたり売上",
    unit: "yen",
    calc: { kind: "ratio", numerator: "salesActual", denominator: "totalVisits" },
    direction: "up",
  },
  { id: "cancelRate", name: "キャンセル率", unit: "percent", calc: { kind: "series", key: "cancelRate" }, direction: "down" },
  { id: "makiSales", name: "巻き爪 売上", unit: "yen", calc: { kind: "series", key: "makiSales" }, direction: "up" },
  { id: "jibaiSales", name: "自賠 売上", unit: "yen", calc: { kind: "series", key: "jibaiSales" }, direction: "up" },
  { id: "googleReviews", name: "Google口コミ（件）", unit: "count", calc: { kind: "series", key: "googleReviews" }, direction: "up" },
];

/** 組織図の役割（行名の前方一致。長いものが優先）。施術者の換算：時短・アルバイトは 0.5、受付は 0 */
export const STAFF_ROLES: TenantConfig["staffRoles"] = [
  { role: "director", label: "院長", aliases: ["院長"], fte: 1 },
  { role: "deputy", label: "副院長", aliases: ["副院長"], fte: 1 },
  { role: "therapist", label: "施術者", aliases: ["施術者"], fte: 1 },
  { role: "short", label: "時短施術者", aliases: ["時短施術者", "時短"], fte: 0.5 },
  { role: "part", label: "施術者（アルバイト）", aliases: ["施術者(ア)", "施術者(アルバイト)", "施術者(パ)"], fte: 0.5 },
  { role: "reception", label: "受付", aliases: ["受付"], fte: 0 },
  { role: "receptionPart", label: "受付（アルバイト・パート）", aliases: ["受付(ア/パ)", "受付(ア)", "受付(パ)"], fte: 0 },
];
