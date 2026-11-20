"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Copy, LayoutDashboard, RotateCcw, Save, Target, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSimulatorStore } from "@/hooks/use-simulator-store";
import { calculate, SCENARIOS, type ScenarioId } from "@/lib/sim";
import { cn } from "@/lib/utils";
import { DashboardTab } from "./dashboard-tab";
import { ReverseTab } from "./reverse-tab";
import { SimulatorTab } from "./simulator-tab";
import { StickyTotal } from "./summary";

type TabId = "sim" | "reverse" | "dashboard";

export function SimulatorApp() {
  const store = useSimulatorStore();
  const { input, update, active, setActive, save, reset, copyFrom, dirty, saved, drafts, hydrated } = store;
  const result = useMemo(() => calculate(input), [input]);
  const [tab, setTab] = useState<TabId>("sim");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const activeLabel = SCENARIOS.find((s) => s.id === active)!.label;
  const savedAt = saved.scenarios[active].savedAt;

  const handleSave = () => {
    setToast(save() ? `「${activeLabel}」を保存しました` : "保存できませんでした（ブラウザの設定を確認してください）");
  };

  const handleReset = () => {
    if (window.confirm(`「${activeLabel}」の入力をデモ用の初期値に戻しますか？\n（保存するまで、保存済みのデータは変わりません）`)) {
      reset();
      setToast("初期値に戻しました");
    }
  };

  const others = SCENARIOS.filter((s) => s.id !== active);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="pb-24 sm:pb-10">
      <header className="sticky top-0 z-30 bg-navy-800 text-white shadow-md">
        <div className="mx-auto max-w-6xl px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
              <Calculator className="size-5" />
              整骨院 総売上シミュレーター
            </h1>
            <TabsList className="ml-auto hidden bg-navy-900/60 sm:inline-flex">
              <NavTriggers dark />
            </TabsList>
          </div>
          <div className="mt-2">
            <StickyTotal result={result} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-4">
        {/* パターン切替・保存 */}
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
          <div role="radiogroup" aria-label="パターン" className="grid flex-1 grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:max-w-md">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={active === s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  "relative rounded-lg px-2 py-2 text-sm font-bold transition-colors",
                  active === s.id ? "bg-navy-800 text-white shadow" : "text-slate-600 hover:bg-white",
                )}
              >
                {s.label}
                {hydrated && dirty[s.id] && (
                  <span className="absolute top-1 right-1.5 size-2 rounded-full bg-amber-500" aria-label="未保存" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <CopyMenu others={others} onCopy={(id) => { copyFrom(id); setToast(`「${SCENARIOS.find((s) => s.id === id)!.label}」の内容をコピーしました`); }} />
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw />
              リセット
            </Button>
            <Button size="sm" onClick={handleSave} className="flex-1 sm:flex-none">
              <Save />
              保存
            </Button>
          </div>
          <p className="text-xs text-slate-500 sm:ml-1 sm:w-36">
            {!hydrated
              ? "読み込み中…"
              : dirty[active]
                ? "未保存の変更があります"
                : savedAt
                  ? `保存済み ${new Date(savedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : "まだ保存していません"}
          </p>
        </div>

        <TabsContent value="sim">
          <SimulatorTab input={input} result={result} update={update} />
        </TabsContent>
        <TabsContent value="reverse">
          <ReverseTab input={input} update={update} />
        </TabsContent>
        <TabsContent value="dashboard">
          <DashboardTab input={input} result={result} drafts={drafts} dirty={dirty} active={active} />
        </TabsContent>

        <p className="flex gap-2 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 size-4 shrink-0" />
          初期値はデモ用の仮の数値で、実際の保険請求単価・算定額ではありません。保険の単価は実績にもとづく「平均値」として入力してください。
          本ツールは売上の試算用であり、保険算定の適法性や請求可否を判定するものではありません。
        </p>
      </div>

      {/* スマホ用 下部ナビ */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <TabsList className="flex w-full bg-transparent p-0">
          <NavTriggers />
        </TabsList>
      </nav>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-20 z-40 mx-auto w-fit max-w-[90vw] rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg sm:bottom-6"
        >
          {toast}
        </div>
      )}
    </Tabs>
  );
}

function NavTriggers({ dark }: { dark?: boolean }) {
  const items: { value: TabId; label: string; icon: React.ReactNode }[] = [
    { value: "sim", label: "シミュレーター", icon: <Calculator /> },
    { value: "reverse", label: "目標逆算", icon: <Target /> },
    { value: "dashboard", label: "ダッシュボード", icon: <LayoutDashboard /> },
  ];
  return (
    <>
      {items.map((i) => (
        <TabsTrigger
          key={i.value}
          value={i.value}
          className={cn(
            dark
              ? "text-navy-100 data-[state=active]:bg-white data-[state=active]:text-navy-800"
              : "flex-col gap-0.5 py-1.5 text-[11px] data-[state=active]:bg-navy-50 data-[state=active]:shadow-none [&_svg]:size-5",
          )}
        >
          {i.icon}
          {i.label}
        </TabsTrigger>
      ))}
    </>
  );
}

function CopyMenu({
  others,
  onCopy,
}: {
  others: { id: ScenarioId; label: string }[];
  onCopy: (id: ScenarioId) => void;
}) {
  return (
    <label className="relative inline-flex">
      <span className="sr-only">他のパターンからコピー</span>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-600">
        <Copy className="size-4" />
      </span>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onCopy(e.target.value as ScenarioId);
        }}
        className="h-9 appearance-none rounded-lg border border-slate-300 bg-white pr-3 pl-8 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <option value="">コピー</option>
        {others.map((o) => (
          <option key={o.id} value={o.id}>
            「{o.label}」から
          </option>
        ))}
      </select>
    </label>
  );
}
