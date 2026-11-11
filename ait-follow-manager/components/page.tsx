import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  back,
  actions,
  description,
}: {
  title: string;
  back?: string;
  actions?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      {back && (
        <Link href={back} className="mb-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden />
          戻る
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        {actions && <div className="ml-auto flex gap-2">{actions}</div>}
      </div>
      {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Tabs({ items, current }: { items: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <div className="-mx-4 mb-3 overflow-x-auto px-4">
      <div role="tablist" className="flex w-max gap-1 rounded-lg bg-muted p-1">
        {items.map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={t.key === current}
            href={t.href}
            className={cn(
              "flex h-9 items-center gap-1 rounded-md px-3 text-sm font-semibold text-muted-foreground",
              t.key === current && "bg-card text-foreground shadow-xs",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="text-xs tabular-nums">{t.count}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, tone, href }: { label: string; value: number | string; tone?: "danger" | "primary"; href?: string }) {
  const inner = (
    <>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-bold tabular-nums", tone === "danger" && "text-danger", tone === "primary" && "text-primary")}>
        {value}
      </span>
    </>
  );
  const cls = "flex flex-col gap-1 rounded-lg border bg-card p-3";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-primary")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
