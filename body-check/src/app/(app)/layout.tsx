import { DemoBanner } from "@/components/DemoBanner";

/** 患者様向けの画面（トップ・チェック・結果など）はスマホ幅で表示する */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <DemoBanner />
      {children}
    </div>
  );
}
