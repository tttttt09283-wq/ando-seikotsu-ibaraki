import { AppShell } from "@/components/shell/app-shell";
import { getAppModel } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { mode, email } = await getAppModel();
  return (
    <AppShell mode={mode} email={email}>
      {children}
    </AppShell>
  );
}
