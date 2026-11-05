import { Alert } from "@/components/ui/alert";

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <Alert tone="danger">{err}</Alert>;
  if (ok) return <Alert tone="ok">{ok}</Alert>;
  return null;
}
