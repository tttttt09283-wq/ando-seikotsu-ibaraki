import Link from "next/link";
import { categoryLabel, KIND_LABEL, STATUS_LABEL, type Kind, type Status } from "@/lib/config";

export const btn = "inline-flex items-center justify-center gap-1 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white active:opacity-80 disabled:opacity-40";
export const btnGhost = "inline-flex items-center justify-center gap-1 rounded-lg border border-navy px-4 py-2.5 text-sm font-bold text-navy active:bg-navy-50 disabled:opacity-40";
export const btnDanger = "inline-flex items-center justify-center gap-1 rounded-lg border border-red-700 px-4 py-2.5 text-sm font-bold text-red-700 active:bg-red-50";
export const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy-100";
export const label = "mb-1 block text-sm font-bold text-neutral-800";

export function PageTitle({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-bold text-navy">{title}</h1>
        {lead && <p className="mt-1 text-sm text-neutral-600">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, right, className = "" }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`mb-4 rounded-xl border border-neutral-200 bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-bold text-navy">{title}</h2>
          {right}
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  returned: "bg-amber-50 text-amber-800 border border-amber-300",
  gm_review: "bg-navy-50 text-navy border border-navy-100",
  president_approval: "bg-navy-50 text-navy border border-navy-100",
  legal_hold: "bg-red-50 text-red-800 border border-red-200",
  published: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  superseded: "bg-neutral-100 text-neutral-500",
  archived: "bg-neutral-100 text-neutral-500",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "red" | "navy" | "green" }) {
  const t = { plain: "bg-neutral-100 text-neutral-700", red: "bg-red-700 text-white", navy: "bg-navy text-white", green: "bg-emerald-50 text-emerald-800 border border-emerald-200" }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${t}`}>{children}</span>;
}

export function ImportanceBadge({ v }: { v: "A" | "B" | "C" }) {
  const t = { A: "border-red-700 text-red-700", B: "border-navy text-navy", C: "border-neutral-400 text-neutral-500" }[v];
  return <span className={`inline-block rounded border px-1.5 text-xs font-bold ${t}`}>{v}</span>;
}

export function DocRowLink({ code, kind, title, status, category, importance, right }: {
  code: string; kind: Kind; title: string; status: Status; category: string; importance: "A" | "B" | "C"; right?: React.ReactNode;
}) {
  return (
    <Link href={`/docs/${code}`} className="flex items-start justify-between gap-3 border-b border-neutral-100 py-3 last:border-0 active:bg-neutral-50">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          <span className="font-mono">{code}</span>
          <ImportanceBadge v={importance} />
          <span>{categoryLabel(category)}</span>
          {kind !== "rule" && <span>・{KIND_LABEL[kind]}</span>}
        </div>
        <div className="mt-0.5 font-bold leading-snug">{title}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {status !== "published" && <StatusBadge status={status} />}
        {right}
      </div>
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-neutral-500">{children}</p>;
}

export const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00+09:00` : d) : d;
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(x);
};
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—";
