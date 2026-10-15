import { AppShell } from "@/components/company/AppShell";
import { CompanyStateProvider } from "@/components/company/StateProvider";
import { tick } from "@/lib/engine/engine";
import { getEngineDeps, getRuntimeInfo } from "@/lib/server/runtime";
import { buildSnapshot } from "@/lib/view";

export const dynamic = "force-dynamic";

/** ログイン後の共通レイアウト。初回表示用の会社の状態をサーバー側で用意する（認証は proxy.ts で確認済み） */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const deps = getEngineDeps();
  await tick(deps);
  const runtime = getRuntimeInfo();
  const snapshot = buildSnapshot(await deps.store.read(), runtime.mode, deps.now(), deps.limits);
  return (
    <CompanyStateProvider initialSnapshot={snapshot} initialRuntime={runtime}>
      <AppShell>{children}</AppShell>
    </CompanyStateProvider>
  );
}
