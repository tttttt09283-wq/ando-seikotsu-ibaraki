import type { Clinic, TenantConfig } from "@/lib/tenant-types";
import type { OrgCounts, StaffRole } from "@/lib/types";
import { matchClinic } from "./daily-report";
import { normalizeLabel, parseNumberCell } from "./normalize";

/**
 * 組織図（行＝役割、列＝院）から、院ごとの役割別の人数を数える。
 * スタッフの名前は数えるだけで、結果には残さない。
 * 「ブロックマネージャー」の行は、院のブロック（担当の単位）として読み取る（結合セルは右に引き継ぐ）。
 */
export type OrgChartResult = {
  clinics: { clinicId: string; counts: OrgCounts; fte: number }[];
  unmatched: { label: string; counts: OrgCounts; fte: number }[];
  blocks: Record<string, string>;
  warnings: string[];
};

type Roles = TenantConfig["staffRoles"];

function matchRole(label: string, roles: Roles) {
  const l = normalizeLabel(label);
  let best: { r: Roles[number]; len: number } | undefined;
  for (const r of roles) {
    for (const a of r.aliases) {
      const al = normalizeLabel(a);
      if (al && l.startsWith(al) && (!best || al.length > best.len)) best = { r, len: al.length };
    }
  }
  return best?.r;
}

export function fteOf(counts: OrgCounts, roles: Roles): number {
  const n = roles.reduce((s, r) => s + (counts[r.role] ?? 0) * r.fte, 0);
  return Math.round(n * 10) / 10;
}

export function parseOrgChart(grid: string[][], opts: { clinics: Clinic[]; roles: Roles }): OrgChartResult {
  const warnings: string[] = [];
  // 見出し行：「院名」のセルがある行（なければ院名が2つ以上並ぶ行）
  let headerIdx = -1;
  let labelCol = 0;
  for (let r = 0; r < Math.min(grid.length, 20) && headerIdx < 0; r++) {
    const i = grid[r].findIndex((c) => /^(院名|店舗名?|拠点)$/.test(normalizeLabel(c ?? "")));
    if (i >= 0) {
      headerIdx = r;
      labelCol = i;
    }
  }
  if (headerIdx < 0) {
    for (let r = 0; r < Math.min(grid.length, 20) && headerIdx < 0; r++) {
      const hits = grid[r].map((c, i) => ({ i, c: matchClinic(c ?? "", opts.clinics) })).filter((x) => x.c);
      if (hits.length >= 2) {
        headerIdx = r;
        labelCol = Math.max(0, hits[0].i - 1);
      }
    }
  }
  if (headerIdx < 0) return { clinics: [], unmatched: [], blocks: {}, warnings: ["「院名」の行（院が横に並ぶ見出し）が見つかりませんでした。"] };

  // 院の列：「院名」の右から、空のセルが来るまで
  const header = grid[headerIdx];
  const cols: { col: number; label: string; clinicId?: string }[] = [];
  for (let col = labelCol + 1; col < header.length; col++) {
    const label = (header[col] ?? "").trim();
    if (!label) break;
    cols.push({ col, label, clinicId: matchClinic(label, opts.clinics)?.id });
  }
  const counts = cols.map(() => ({}) as OrgCounts);
  const blocks: Record<string, string> = {};

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const label = (row[labelCol] ?? "").trim();
    if (!label) continue;
    const cells = cols.map(({ col }) => (row[col] ?? "").trim());
    const filled = cells.filter(Boolean);
    if (!filled.length) continue;
    // 人数の集計行（「院長 1 1 1…」）は数えない
    if (filled.every((c) => parseNumberCell(c) !== undefined)) continue;
    const l = normalizeLabel(label);
    if (/ブロック|^bm/.test(l)) {
      let carry = "";
      cells.forEach((c, i) => {
        carry = c || carry;
        if (carry && cols[i].clinicId) blocks[cols[i].clinicId!] = carry;
      });
      continue;
    }
    if (/マネージャー|^gm|統括/.test(l)) continue;
    const role = matchRole(label, opts.roles);
    if (!role) continue;
    cells.forEach((c, i) => {
      if (!c || parseNumberCell(c) !== undefined) return;
      counts[i][role.role as StaffRole] = (counts[i][role.role as StaffRole] ?? 0) + 1;
    });
  }

  const clinics: OrgChartResult["clinics"] = [];
  const unmatched: OrgChartResult["unmatched"] = [];
  cols.forEach((c, i) => {
    const item = { counts: counts[i], fte: fteOf(counts[i], opts.roles) };
    if (c.clinicId && !clinics.some((x) => x.clinicId === c.clinicId)) clinics.push({ clinicId: c.clinicId, ...item });
    else unmatched.push({ label: c.label, ...item });
  });
  if (!clinics.length) warnings.push("院として分かる列がありませんでした。院名を確認してください。");
  return { clinics, unmatched, blocks, warnings };
}
