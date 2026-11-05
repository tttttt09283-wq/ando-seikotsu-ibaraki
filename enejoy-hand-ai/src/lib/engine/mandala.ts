import type { MandalaChart, MandalaTheme } from "@/lib/types";
import { TENANT } from "@/tenant";
import { audit, EngineError, iso, newId, type EngineDeps } from "./engine";

/**
 * マンダラチャート（中心の目標 → 8つのテーマ → 各8つの行動）。
 * 会社全体・部門・院ごとに作れる。会社の本番の記録として扱い、デモの初期化では消さない。
 */

export const emptyThemes = (): MandalaTheme[] =>
  Array.from({ length: 8 }, () => ({ title: "", items: Array.from({ length: 8 }, () => ({ text: "", status: "todo" as const })) }));

export function templateThemes(): MandalaTheme[] {
  const t = TENANT.mandalaTemplate;
  return emptyThemes().map((e, i) => ({
    title: t.themes[i]?.title ?? "",
    items: e.items.map((x, j) => ({ ...x, text: t.themes[i]?.items[j] ?? "" })),
  }));
}

/** 行動の進み具合（文字が入っている行動のうち、完了・進行中の数） */
export function mandalaProgress(c: Pick<MandalaChart, "themes">) {
  const items = c.themes.flatMap((t) => t.items).filter((i) => i.text.trim());
  return {
    total: items.length,
    done: items.filter((i) => i.status === "done").length,
    doing: items.filter((i) => i.status === "doing").length,
    themes: c.themes.map((t) => {
      const xs = t.items.filter((i) => i.text.trim());
      return { total: xs.length, done: xs.filter((i) => i.status === "done").length };
    }),
  };
}

export async function createMandala(
  deps: EngineDeps,
  actorId: string,
  input: { title: string; scope: MandalaChart["scope"]; scopeLabel?: string; template: "blank" | "company"; copyFrom?: string },
) {
  return deps.store.transact((data) => {
    if (data.mandala.charts.length >= 30) throw new EngineError("マンダラチャートは30枚までです", "LIMIT");
    const now = iso(deps.now());
    const base = input.copyFrom ? data.mandala.charts.find((c) => c.id === input.copyFrom) : undefined;
    if (input.copyFrom && !base) throw new EngineError("コピー元が見つかりません", "NOT_FOUND");
    const chart: MandalaChart = {
      id: newId("mdl"),
      title: input.title.trim(),
      scope: input.scope,
      scopeLabel: input.scopeLabel?.trim() || undefined,
      center: base ? base.center : input.template === "company" ? TENANT.mandalaTemplate.center : "",
      themes: base ? structuredClone(base.themes) : input.template === "company" ? templateThemes() : emptyThemes(),
      createdAt: now,
      updatedAt: now,
      updatedBy: actorId,
    };
    data.mandala.charts.push(chart);
    audit(data, deps.now(), actorId, "mandala.create", chart.title);
    return chart;
  });
}

export async function updateMandala(
  deps: EngineDeps,
  actorId: string,
  input: { id: string; title?: string; scopeLabel?: string; center?: string; themes?: MandalaTheme[]; note?: string },
) {
  return deps.store.transact((data) => {
    const c = data.mandala.charts.find((x) => x.id === input.id);
    if (!c) throw new EngineError("マンダラチャートが見つかりません", "NOT_FOUND");
    if (input.title != null) c.title = input.title.trim();
    if (input.scopeLabel !== undefined) c.scopeLabel = input.scopeLabel.trim() || undefined;
    if (input.center !== undefined) c.center = input.center.trim();
    if (input.note !== undefined) c.note = input.note.trim() || undefined;
    if (input.themes) {
      if (input.themes.length !== 8 || input.themes.some((t) => t.items.length !== 8)) throw new EngineError("8つのテーマ×8つの行動で保存してください", "INVALID_STATE");
      c.themes = input.themes.map((t) => ({
        title: t.title.trim(),
        items: t.items.map((i) => ({ text: i.text.trim(), status: i.text.trim() ? i.status : "todo", ...(i.owner?.trim() ? { owner: i.owner.trim() } : {}) })),
      }));
    }
    c.updatedAt = iso(deps.now());
    c.updatedBy = actorId;
    audit(data, deps.now(), actorId, "mandala.update", c.title);
    return c;
  });
}

export async function removeMandala(deps: EngineDeps, actorId: string, id: string) {
  await deps.store.transact((data) => {
    const c = data.mandala.charts.find((x) => x.id === id);
    if (!c) throw new EngineError("マンダラチャートが見つかりません", "NOT_FOUND");
    data.mandala.charts = data.mandala.charts.filter((x) => x.id !== id);
    audit(data, deps.now(), actorId, "mandala.remove", c.title);
  });
}
