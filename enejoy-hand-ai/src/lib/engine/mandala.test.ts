import { describe, expect, it } from "vitest";
import { getLimits } from "@/config/limits";
import { MemoryStore } from "@/lib/store/store";
import { buildSnapshot } from "@/lib/view";
import { DemoExecutor } from "./demo-executor";
import { EngineError, resetDemoData, type EngineDeps } from "./engine";
import { createMandala, mandalaProgress, removeMandala, updateMandala } from "./mandala";

const OPERATOR = "iwanaga";

function setup() {
  const deps: EngineDeps = {
    store: new MemoryStore(),
    executor: new DemoExecutor(),
    limits: getLimits(),
    timing: { analyzeMs: 1, thinkMs: 1, workMs: 1, reviewMs: 1, reportMs: 1 },
    now: () => new Date("2026-11-05T03:00:00Z"),
    costOf: () => 0,
  };
  return { deps };
}

describe("マンダラチャート", () => {
  it("会社のたたき台で作ると、中心の目標と8テーマ×8行動が入る。白紙は空", async () => {
    const { deps } = setup();
    const c = await createMandala(deps, OPERATOR, { title: "会社", scope: "company", template: "company" });
    expect(c.center).toContain("3億円");
    expect(c.themes).toHaveLength(8);
    expect(c.themes.every((t) => t.title && t.items.length === 8 && t.items.every((i) => i.text && i.status === "todo"))).toBe(true);
    const b = await createMandala(deps, OPERATOR, { title: "茨木院", scope: "clinic", scopeLabel: "茨木院", template: "blank" });
    expect(b.center).toBe("");
    expect(b.themes.flatMap((t) => t.items).every((i) => i.text === "")).toBe(true);
    const snap = buildSnapshot(await deps.store.read(), "demo", deps.now(), deps.limits);
    expect(snap.mandala.charts.map((x) => x.title)).toEqual(["会社", "茨木院"]);
  });

  it("書き込み・進み具合・コピー・削除。空のマスは未着手に戻す。デモの初期化では消えない", async () => {
    const { deps } = setup();
    const c = await createMandala(deps, OPERATOR, { title: "会社", scope: "company", template: "company" });
    const themes = structuredClone(c.themes);
    themes[0].items[0].status = "done";
    themes[0].items[1].status = "doing";
    themes[1].items[0] = { text: "  ", status: "done" };
    const u = await updateMandala(deps, OPERATOR, { id: c.id, center: "  年間売上3億円  ", themes });
    expect(u.center).toBe("年間売上3億円");
    expect(u.themes[1].items[0]).toEqual({ text: "", status: "todo" });
    expect(mandalaProgress(u)).toMatchObject({ total: 63, done: 1, doing: 1 });

    const copy = await createMandala(deps, OPERATOR, { title: "コピー", scope: "department", template: "blank", copyFrom: c.id });
    expect(copy.themes[0].items[0].status).toBe("done");
    await expect(updateMandala(deps, OPERATOR, { id: c.id, themes: themes.slice(0, 7) })).rejects.toBeInstanceOf(EngineError);

    await resetDemoData(deps);
    expect((await deps.store.read()).mandala.charts).toHaveLength(2);
    await removeMandala(deps, OPERATOR, copy.id);
    expect((await deps.store.read()).mandala.charts.map((x) => x.id)).toEqual([c.id]);
    expect((await deps.store.read()).audit.some((a) => a.action === "mandala.update")).toBe(true);
  });
});
