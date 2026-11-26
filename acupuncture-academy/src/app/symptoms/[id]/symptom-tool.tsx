"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, ClipboardCopy, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ReviewStatusBadge } from "@/components/common/badges";
import { symptomMap, assemble, rankPatterns, type PointRole } from "@/data/symptoms";
import { pointMap } from "@/data/points";
import { channelInfo } from "@/data/meridians";
import { lessonMap } from "@/data/curriculum";
import { caseMap } from "@/data/cases";

const roleInfo: Record<PointRole, { label: string; desc: string; color: string }> = {
  局所: { label: "局所穴", desc: "症状のある部位の経穴（標）", color: "#1e3a6b" },
  遠隔: { label: "遠隔穴", desc: "同じ経絡の離れた経穴（経絡をつなぐ）", color: "#0f766e" },
  背景: { label: "背景（証）への穴", desc: "体質・証に対応する要穴（本）", color: "#7a3e9d" },
};

function StepTitle({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-primary">
      <span className={cn("grid size-6 place-items-center rounded-full text-xs text-white", done ? "bg-ok" : "bg-primary")}>{done ? <Check className="size-3.5" /> : n}</span>
      {title}
    </h2>
  );
}

export function SymptomTool({ guideId }: { guideId: string }) {
  const guide = symptomMap[guideId];
  const [flags, setFlags] = React.useState<string[]>([]);
  const [cleared, setCleared] = React.useState(false);
  const [region, setRegion] = React.useState<string | null>(null);
  const [regionChosen, setRegionChosen] = React.useState(!guide.regions?.length);
  const [signs, setSigns] = React.useState<string[]>([]);
  const [patternPick, setPatternPick] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[] | null>(null);
  const [copied, setCopied] = React.useState(false);

  const ranked = rankPatterns(guide, signs);
  const suggested = ranked[0]?.hits ? ranked[0].pattern.id : null;
  const patternId = patternPick ?? suggested;
  const pattern = guide.patterns.find((p) => p.id === patternId) ?? null;
  const candidates = assemble(guide, region, patternId);
  const regionObj = guide.regions?.find((r) => r.id === region);

  // 既定の選択：役割ごとに先頭から2つまで
  const defaultSel = (["局所", "遠隔", "背景"] as PointRole[]).flatMap((role) =>
    candidates
      .filter((c) => c.role === role)
      .slice(0, 2)
      .map((c) => c.code),
  );
  const sel = selected ?? defaultSel;
  const toggle = (code: string) => setSelected((s) => ((s ?? defaultSel).includes(code) ? (s ?? defaultSel).filter((c) => c !== code) : [...(s ?? defaultSel), code]));
  const resetSel = () => setSelected(null);

  const allSigns = [...new Set(guide.patterns.flatMap((p) => p.signs))];
  const lesson = guide.lessonId ? lessonMap[guide.lessonId] : null;
  const cs = guide.caseId ? caseMap[guide.caseId] : null;

  const summary = [
    `【${guide.name}】取穴の候補（教育用・要確認）`,
    regionObj ? `部位：${regionObj.label}（${regionObj.channels}）` : null,
    pattern ? `証の仮説：${pattern.name}／治則：${pattern.principle}` : "証：未選択",
    `配穴案：${sel.map((c) => `${pointMap[c]?.name ?? c}（${c}）`).join("・")}`,
    pattern?.method ? `刺激の目安：${pattern.method}` : null,
    `評価：${guide.evaluation.join("／")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{guide.group}</span>
          <ReviewStatusBadge status={guide.reviewStatus} short />
        </div>
        <h1 className="text-2xl font-bold text-primary">{guide.name}の取穴を考える</h1>
        <p className="mt-1 text-sm text-muted-foreground">伝統的な配穴の考え方の例を、根拠とともに示します。処方ではありません。最終判断は資格者が行ってください。</p>
      </div>

      {/* 1. 危険徴候 */}
      <section className="rounded-xl border bg-white p-4 sm:p-5">
        <StepTitle n={1} title="医学的な危険徴候の確認" done={cleared} />
        <p className="mb-3 text-sm text-muted-foreground">当てはまるものがあれば選んでください。</p>
        <ul className="space-y-2">
          {guide.redFlags.map((f) => {
            const on = flags.includes(f);
            return (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => {
                    setFlags((x) => (on ? x.filter((y) => y !== f) : [...x, f]));
                    setCleared(false);
                  }}
                  aria-pressed={on}
                  className={cn("flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm", on ? "border-warn bg-red-50" : "bg-white hover:border-warn/40")}
                >
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-[10px]", on ? "border-warn bg-warn text-white" : "border-input")}>{on ? "✓" : ""}</span>
                  {f}
                </button>
              </li>
            );
          })}
        </ul>
        {flags.length > 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-warn/30 bg-red-50 p-3 text-sm" role="alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            <p>
              <span className="font-bold text-warn">施術より医療機関の受診を優先してください。</span>
              当てはまる危険徴候がある場合、このツールでの取穴の検討は行いません。必要に応じて主治医に連絡し、緊急性が高い場合は救急要請を検討します。
            </p>
          </div>
        ) : (
          !cleared && (
            <Button className="mt-4 w-full sm:w-auto" onClick={() => setCleared(true)}>
              いずれも当てはまらないことを確認した
            </Button>
          )
        )}
      </section>

      {cleared && flags.length === 0 && (
        <>
          {/* 2. 部位 */}
          {guide.regions?.length ? (
            <section className="rounded-xl border bg-white p-4 sm:p-5">
              <StepTitle n={2} title="症状の部位 → 関係する経絡" done={regionChosen} />
              <div className="grid gap-2 sm:grid-cols-2">
                {guide.regions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRegion(r.id);
                      setRegionChosen(true);
                      resetSel();
                    }}
                    aria-pressed={region === r.id}
                    className={cn("rounded-lg border px-3 py-2.5 text-left", region === r.id ? "border-primary bg-accent ring-1 ring-primary" : "bg-white hover:border-primary/40")}
                  >
                    <span className="block text-sm font-semibold">{r.label}</span>
                    <span className="block text-xs text-muted-foreground">{r.channels}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setRegion(null);
                    setRegionChosen(true);
                    resetSel();
                  }}
                  aria-pressed={regionChosen && region === null}
                  className={cn("rounded-lg border px-3 py-2.5 text-left text-sm", regionChosen && region === null ? "border-primary bg-accent ring-1 ring-primary" : "bg-white text-muted-foreground")}
                >
                  部位がはっきりしない・全体
                </button>
              </div>
            </section>
          ) : null}

          {regionChosen && (
            <>
              {/* 3. 所見 → 証 */}
              <section className="rounded-xl border bg-white p-4 sm:p-5">
                <StepTitle n={guide.regions?.length ? 3 : 2} title="随伴する所見 → 証の仮説" done={Boolean(pattern)} />
                <p className="mb-3 text-sm text-muted-foreground">当てはまる所見を選ぶと、合う証の候補が上に並びます。証は仮説であり、四診で確かめてください。</p>
                <div className="flex flex-wrap gap-1.5">
                  {allSigns.map((s) => {
                    const on = signs.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setSigns((x) => (on ? x.filter((y) => y !== s) : [...x, s]));
                          setPatternPick(null);
                          resetSel();
                        }}
                        className={cn("rounded-full border px-3 py-1.5 text-xs", on ? "border-primary bg-primary text-white" : "bg-white hover:border-primary/40")}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                <ul className="mt-4 space-y-2">
                  {ranked.map(({ pattern: p, hits }) => {
                    const on = patternId === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPatternPick(p.id);
                            resetSel();
                          }}
                          aria-pressed={on}
                          className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left", on ? "border-extra bg-purple-50 ring-1 ring-extra" : "bg-white hover:border-extra/40")}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{p.name}</span>
                            <span className="block text-xs text-muted-foreground">治則：{p.principle}</span>
                          </span>
                          <span className={cn("shrink-0 text-xs tabular-nums", hits ? "font-semibold text-extra" : "text-muted-foreground")}>
                            所見 {hits}/{p.signs.length}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* 4. 取穴候補 */}
              <section className="rounded-xl border bg-white p-4 sm:p-5">
                <StepTitle n={guide.regions?.length ? 4 : 3} title="取穴の候補と根拠" />
                <p className="mb-3 text-sm text-muted-foreground">局所・遠隔・背景から、役割ごとに2つまでを初めから選んでいます。患者さんの状態に合わせて選び直してください。</p>
                {(["局所", "遠隔", "背景"] as PointRole[]).map((role) => {
                  const list = candidates.filter((c) => c.role === role);
                  if (!list.length) return null;
                  return (
                    <div key={role} className="mb-4">
                      <p className="mb-1.5 text-xs font-semibold" style={{ color: roleInfo[role].color }}>
                        {roleInfo[role].label}
                        <span className="ml-2 font-normal text-muted-foreground">{roleInfo[role].desc}</span>
                      </p>
                      <ul className="space-y-2">
                        {list.map((c) => {
                          const p = pointMap[c.code];
                          const on = sel.includes(c.code);
                          return (
                            <li key={c.code} className={cn("rounded-lg border p-3", on ? "border-primary/50 bg-accent/40" : "bg-white")}>
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggle(c.code)}
                                  aria-pressed={on}
                                  aria-label={`${p?.name ?? c.code}を配穴案に${on ? "含めない" : "含める"}`}
                                  className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-[10px]", on ? "border-primary bg-primary text-white" : "border-input")}
                                >
                                  {on ? "✓" : ""}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <Link href={`/points/${c.code}`} className="font-semibold hover:underline">
                                    {p?.name ?? c.code}
                                    <span className="ml-1.5 font-mono text-xs" style={{ color: p ? channelInfo[p.meridian].color : undefined }}>
                                      {c.code}
                                    </span>
                                  </Link>
                                  <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                                    {c.reasons.map((x) => (
                                      <li key={x}>・{x}</li>
                                    ))}
                                  </ul>
                                  {p?.safety[0] && (
                                    <p className="mt-1.5 flex gap-1.5 text-xs text-warn">
                                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                                      {p.safety[0]}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </section>

              {/* 5. まとめ */}
              <section className="rounded-xl border-2 border-primary/30 bg-white p-4 sm:p-5">
                <StepTitle n={guide.regions?.length ? 5 : 4} title="配穴案のまとめ" />
                <dl className="space-y-2 text-sm">
                  {regionObj && (
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">部位と経絡</dt>
                      <dd>
                        {regionObj.label}（{regionObj.channels}）
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">証の仮説と治則</dt>
                    <dd>{pattern ? `${pattern.name}：${pattern.principle}` : "未選択（所見を選ぶか、証を選んでください）"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">配穴案（{sel.length}穴）</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {sel.length ? (
                        sel.map((c) => (
                          <span key={c} className="rounded-md bg-primary px-2 py-1 text-xs text-white">
                            {pointMap[c]?.name ?? c}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">まだ選ばれていません</span>
                      )}
                    </dd>
                  </div>
                  {pattern?.method && (
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">刺激の目安</dt>
                      <dd>{pattern.method}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">評価項目（施術前後で比べる）</dt>
                    <dd>{guide.evaluation.join("／")}</dd>
                  </div>
                  {guide.cautions?.map((c) => (
                    <p key={c} className="flex gap-1.5 rounded-md bg-red-50 p-2 text-xs text-warn">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      {c}
                    </p>
                  ))}
                </dl>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={copy}>
                    <ClipboardCopy />
                    {copied ? "コピーしました" : "まとめをコピー"}
                  </Button>
                  {lesson && (
                    <Button asChild variant="outline">
                      <Link href={`/lessons/${lesson.id}`}>講義：{lesson.title}</Link>
                    </Button>
                  )}
                  {cs && (
                    <Button asChild>
                      <Link href={`/cases/${cs.id}`}>症例演習で練習する</Link>
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  教育用の配穴の考え方の例です（要確認・未監修）。効果を保証するものではありません。刺鍼の深さ・方向・刺激量は、局所解剖と患者さんの状態・既往・服薬（抗凝固薬など）・同意を確認して決めてください。
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
