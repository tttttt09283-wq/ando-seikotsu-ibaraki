import type { Metadata } from "next";
import { PresidentView } from "@/components/company/PresidentView";
import { tick } from "@/lib/engine/engine";
import { getEngineDeps, getRuntimeInfo } from "@/lib/server/runtime";
import { buildPresidentSnapshot } from "@/lib/view";

export const metadata: Metadata = { title: "代表の承認" };
export const dynamic = "force-dynamic";

/** 代表用の承認画面（認証・役割の確認は proxy.ts で実施済み） */
export default async function PresidentPage() {
  const deps = getEngineDeps();
  await tick(deps);
  const runtime = getRuntimeInfo();
  const snapshot = buildPresidentSnapshot(await deps.store.read(), runtime.mode, deps.now());
  return <PresidentView initial={snapshot} />;
}
