import { parseBody, lineDiff } from "@/lib/rules";

// 規定の本文（かんたんな Markdown を見出し・箇条書き・段落で表示。HTML としては扱わない）
export function RuleBody({ body }: { body: string }) {
  const blocks = parseBody(body);
  return (
    <div className="grid gap-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) =>
        b.type === "h" ? <h3 key={i} className="mt-2 border-l-4 border-brand-600 pl-2 text-base font-black text-brand-800">{b.text}</h3>
        : b.type === "ul" ? <ul key={i} className="ml-5 list-disc space-y-1">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
        : b.type === "ol" ? <ol key={i} className="ml-5 list-decimal space-y-1">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ol>
        : <p key={i} className="whitespace-pre-wrap">{b.text}</p>)}
      {blocks.length === 0 ? <p className="text-stone-500">本文がありません</p> : null}
    </div>
  );
}

// 版の比較（公開中の版 → 改定案）
export function RuleDiff({ before, after }: { before: string; after: string }) {
  const d = lineDiff(before, after);
  const changed = d.filter((x) => x.kind !== "same").length;
  if (!changed) return <p className="text-sm text-stone-500">公開中の版から本文の変更はありません</p>;
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-stone-200 bg-white p-2 text-xs leading-relaxed whitespace-pre-wrap">
      {d.map((x, i) => (
        <div key={i} className={x.kind === "add" ? "bg-green-50 text-green-900" : x.kind === "del" ? "bg-red-50 text-red-800 line-through" : "text-stone-500"}>
          {x.kind === "add" ? "＋ " : x.kind === "del" ? "－ " : "　 "}{x.text || " "}
        </div>
      ))}
    </pre>
  );
}
