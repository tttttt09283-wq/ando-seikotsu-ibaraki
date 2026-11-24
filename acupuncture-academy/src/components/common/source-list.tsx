import { sourceMap } from "@/data/sources";

export function SourceList({ ids, title = "出典" }: { ids: string[]; title?: string }) {
  const list = [...new Set(ids)].map((id) => sourceMap[id]).filter(Boolean);
  if (!list.length) return <p className="text-sm text-verify">出典未登録（要確認）</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium leading-snug">{s.title}</p>
            {s.publisher && <p className="text-muted-foreground">{s.publisher}{s.year ? `（${s.year}）` : ""}</p>}
            {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
            <p className={s.checked ? "mt-1 text-xs text-ok" : "mt-1 text-xs text-verify"}>
              {s.checked ? "原典照合済み" : "原典との照合：未了（要確認）"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
