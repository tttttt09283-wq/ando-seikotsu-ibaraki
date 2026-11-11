export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      <span className="text-primary">A.I.T</span> Follow Manager
    </span>
  );
}

export function CenteredCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center text-xl">
        <Brand />
      </div>
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-bold">{title}</h1>
        {children}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">© A.I.T company</p>
    </main>
  );
}
