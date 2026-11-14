import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor?: string; error?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs">{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-[11px]">{hint}</p>}
      {error && <p className="text-status-red text-xs" role="alert">{error}</p>}
    </div>
  );
}
