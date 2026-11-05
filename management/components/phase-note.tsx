import { Alert } from "@/components/ui/alert";

// まだ作っていない機能の案内（開発の進み具合を正直に表示する）
export function PhaseNote({ phase, children }: { phase: string; children: React.ReactNode }) {
  return <Alert tone="info"><b>{phase}で追加予定：</b>{children}</Alert>;
}
