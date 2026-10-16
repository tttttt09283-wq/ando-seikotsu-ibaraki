"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck, ExternalLink, LoaderCircle, MessageSquareReply, Plug, RefreshCw, Search, Star, Trash2, Unplug } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PERFORMANCE_METRICS, type ApiPlace } from "@/lib/google/client";
import { demoReplyDraft } from "@/lib/google/demo";
import { formatDateTime } from "@/lib/time";
import type { CustomerReview } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TENANT } from "@/tenant";
import { useCompany } from "./StateProvider";

const TABS = [
  { id: "overview", label: "概要" },
  { id: "reviews", label: "口コミ" },
  { id: "performance", label: "表示回数・電話" },
  { id: "competitors", label: "地域の競合" },
  { id: "settings", label: "接続・設定" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const inputCls = "h-9 w-full rounded-md border bg-transparent px-2.5 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm";
const clinicName = (id?: string) => TENANT.clinics.find((c) => c.id === id)?.name ?? "（院が未設定）";
const stars = (n: number | null | undefined) => (n == null ? "—" : `★${n.toFixed(1)}`);
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ja-JP"));
const signed = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("ja-JP")}`);

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("flex items-start gap-1.5 text-xs", msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
      {msg.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden /> : <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
      {msg.text}
    </p>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`星${rating}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cn("size-3.5", i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------

function Overview({ go }: { go: (t: TabId) => void }) {
  const { snapshot } = useCompany();
  const r = snapshot.reputation;
  const cmp = new Map(r.comparison.map((c) => [c.clinicId, c]));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["今月の新着口コミ", `${r.stats.newThisMonth}件`, "7院の合計"],
          ["未返信の口コミ", `${r.stats.unreplied}件`, r.stats.lowUnreplied ? `うち★2以下 ${r.stats.lowUnreplied}件` : "★2以下の未返信なし"],
          ["接続中のプロフィール", `${r.locations.filter((l) => l.clinicId).length}/${TENANT.clinics.length}院`, r.mode === "demo" ? "デモデータ" : "Googleビジネスプロフィール"],
          ["登録した競合", `${r.comparison.reduce((n, c) => n + c.competitors.length, 0)}件`, "院ごとの近隣店舗"],
        ].map(([k, v, sub]) => (
          <div key={k} className={cn("bg-card rounded-xl border p-4", k === "未返信の口コミ" && r.stats.lowUnreplied > 0 && "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/40")}>
            <div className="text-muted-foreground text-xs">{k}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{v}</div>
            <div className="text-muted-foreground text-xs">{sub}</div>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>院別の口コミ</CardTitle>
            <CardDescription>返信率・返信までの日数は直近90日。競合は登録した近隣店舗のうち口コミ件数が最も多い店</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  {["院", "星の平均", "口コミ件数", "今月の新着", "未返信", "返信率", "返信まで", "競合（最多）", "競合の1か月の増加"].map((h, i) => (
                    <th key={h} scope="col" className={cn("px-2 py-2 font-medium whitespace-nowrap", i === 0 ? "pl-1 text-left" : "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.stats.perClinic.map((c) => {
                  const top = [...(cmp.get(c.clinicId)?.competitors ?? [])].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0];
                  return (
                    <tr key={c.clinicId} className="border-b last:border-0">
                      <th scope="row" className="py-2 pr-2 pl-1 text-left font-medium whitespace-nowrap">
                        {c.name}
                        {!c.connected && <span className="text-muted-foreground ml-1 text-[10px]">未接続</span>}
                      </th>
                      <td className={cn("px-2 py-2 text-right tabular-nums", c.averageRating != null && c.averageRating < 4.3 && "text-amber-700 dark:text-amber-400")}>{stars(c.averageRating)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{num(c.totalReviewCount)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.newThisMonth}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                        {c.unreplied}
                        {c.lowUnreplied > 0 && <span className="ml-1 text-xs text-red-600">（★2以下 {c.lowUnreplied}）</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.replyRate90 != null ? `${c.replyRate90}%` : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.medianReplyDays != null ? `${c.medianReplyDays}日` : "—"}</td>
                      <td className="max-w-[16rem] px-2 py-2 text-right">
                        {top ? (
                          <>
                            <span className="block truncate">{top.name}</span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {stars(top.rating)}・{num(top.reviewCount)}件
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{top?.gainMonth != null ? `${signed(top.gainMonth)}件` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => go("reviews")}>
              未返信の口コミに返信する
            </Button>
            <Button size="sm" variant="ghost" onClick={() => go("competitors")}>
              競合を登録・比較する
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReplyBox({ review, onDone }: { review: CustomerReview; onDone: () => void }) {
  const { mutate } = useCompany();
  const [text, setText] = React.useState(() => demoReplyDraft(review, clinicName(review.clinicId)));
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">
        返信案（DEMO MODEのテンプレート）。内容を確認・修正してから承認を依頼してください。病名・来院日など、お客様が特定される内容は書かないでください。
      </p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={5} aria-label="返信文" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !text.trim()}
          onClick={async () => {
            setPending(true);
            const r = await mutate("/api/reputation/reply", { reviewId: review.id, comment: text });
            setPending(false);
            if (!r.ok) return setMsg({ ok: false, text: r.error });
            onDone();
          }}
        >
          {pending && <LoaderCircle className="animate-spin" aria-hidden />}
          承認を依頼する
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          閉じる
        </Button>
      </div>
      <Msg msg={msg} />
    </div>
  );
}

function Reviews() {
  const { snapshot } = useCompany();
  const r = snapshot.reputation;
  const [clinic, setClinic] = React.useState("all");
  const [filter, setFilter] = React.useState<"unreplied" | "low" | "all">("unreplied");
  const [open, setOpen] = React.useState<string | null>(null);
  const pendingFor = new Map(
    snapshot.approvals.flatMap((a) => (a.status === "PENDING" && a.payload?.kind === "review_reply" ? [[a.payload.reviewId, a.id] as const] : [])),
  );
  const list = r.reviews.filter(
    (x) =>
      (clinic === "all" || x.clinicId === clinic) &&
      (filter === "all" || (filter === "unreplied" ? !x.reply : x.rating <= 2)),
  );
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>口コミ</CardTitle>
          <CardDescription>
            新しい順・最大400件。お客様の個人情報を含むため、この端末の中だけに保存し、外部のAIには送りません。
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={clinic} onChange={(e) => setClinic(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm" aria-label="院">
            <option value="all">全院</option>
            {TENANT.clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-9 rounded-md border bg-transparent px-2 text-sm" aria-label="絞り込み">
            <option value="unreplied">未返信のみ</option>
            <option value="low">★2以下</option>
            <option value="all">すべて</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">該当する口コミはありません。</p>
        ) : (
          <ul className="divide-y">
            {list.map((x) => (
              <li key={x.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <StarRow rating={x.rating} />
                  <span className="font-medium">{x.reviewerName}</span>
                  <Badge variant="outline" className="font-normal">
                    {clinicName(x.clinicId)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{formatDateTime(x.createTime)}</span>
                  {x.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
                  {!x.reply && x.rating <= 2 && <Badge className="bg-red-600 text-white">早めの返信を</Badge>}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{x.comment || <span className="text-muted-foreground">（本文なし・星のみ）</span>}</p>
                {x.reply && (
                  <div className="bg-secondary/60 ml-4 rounded-lg p-2.5 text-sm">
                    <div className="text-muted-foreground mb-0.5 text-xs">院からの返信 ・ {formatDateTime(x.reply.updateTime)}</div>
                    <p className="whitespace-pre-wrap">{x.reply.comment}</p>
                  </div>
                )}
                {pendingFor.has(x.id) ? (
                  <Link href="/approvals" className="text-brand inline-flex items-center gap-1 text-xs font-medium hover:underline">
                    返信文が承認待ちです → 承認画面へ
                  </Link>
                ) : open === x.id ? (
                  <ReplyBox review={x} onDone={() => setOpen(null)} />
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setOpen(x.id)}>
                    <MessageSquareReply aria-hidden /> {x.reply ? "返信を書き換える" : "返信案を作る"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Performance() {
  const { snapshot } = useCompany();
  const perf = snapshot.reputation.performance;
  const months = [...new Set(perf.map((p) => p.month))].sort();
  const current = snapshot.revenue.currentMonth;
  // 今月は途中までの数字なので、最初は「最後に締まった月」を表示する
  const [month, setMonth] = React.useState(months.filter((m) => m < current).at(-1) ?? months.at(-1) ?? "");
  const partial = month >= current;
  const prevMonth = partial ? undefined : months[months.indexOf(month) - 1];
  const val = (clinicId: string, m: string | undefined, k: string) => perf.find((p) => p.clinicId === clinicId && p.month === m)?.values[k];
  if (months.length === 0) {
    return <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">まだ表示回数の記録はありません。「接続・設定」でGoogleアカウントを接続してください。</p>;
  }
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>Googleでの見つけられやすさ</CardTitle>
          <CardDescription>Googleビジネスプロフィールの数字（検索・マップでの表示、電話・ルート検索・ウェブサイトのクリック）</CardDescription>
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm" aria-label="月">
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace("-", "年")}月{m >= current ? "（途中）" : ""}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th scope="col" className="py-2 pr-2 pl-1 text-left font-medium">院</th>
                {PERFORMANCE_METRICS.map((m) => (
                  <th key={m.key} scope="col" className="px-2 py-2 text-right font-medium whitespace-nowrap">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...TENANT.clinics.map((c) => ({ id: c.id, name: c.name })), { id: "__total", name: "全院合計" }].map((c) => (
                <tr key={c.id} className={cn("border-b last:border-0", c.id === "__total" && "bg-secondary/60 font-semibold")}>
                  <th scope="row" className="py-2 pr-2 pl-1 text-left font-medium whitespace-nowrap">{c.name}</th>
                  {PERFORMANCE_METRICS.map((m) => {
                    const get = (mm?: string) =>
                      c.id === "__total"
                        ? TENANT.clinics.reduce<number | undefined>((n, x) => {
                            const v = val(x.id, mm, m.key);
                            return v == null ? n : (n ?? 0) + v;
                          }, undefined)
                        : val(c.id, mm, m.key);
                    const v = get(month);
                    const p = get(prevMonth);
                    const diff = v != null && p ? Math.round(((v - p) / p) * 100) : null;
                    return (
                      <td key={m.key} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                        {num(v)}
                        {diff != null && <span className={cn("ml-1 text-[11px]", diff < 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>（{diff > 0 ? "+" : ""}{diff}%）</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          {partial ? "今月は途中までの数字のため、前月比は出していません。" : "（ ）は前月比。"}Googleの集計は数日遅れて反映されます。
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function SnapshotForm({ subjectId, onDone }: { subjectId: string; onDone: () => void }) {
  const { mutate } = useCompany();
  const [rating, setRating] = React.useState("");
  const [count, setCount] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await mutate("/api/reputation/snapshot", {
          subjectId,
          rating: rating ? Number(rating) : undefined,
          reviewCount: count ? Number(count) : undefined,
        });
        if (!r.ok) return setErr(r.error);
        onDone();
      }}
    >
      <input inputMode="decimal" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="星 例 4.5" className={cn(inputCls, "w-24")} aria-label="星の平均" />
      <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} placeholder="件数 例 120" className={cn(inputCls, "w-28")} aria-label="口コミ件数" />
      <Button size="sm" type="submit">
        記録
      </Button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </form>
  );
}

function AddCompetitor({ clinicId }: { clinicId: string }) {
  const { mutate, runtime } = useCompany();
  const clinic = TENANT.clinics.find((c) => c.id === clinicId)!;
  const [query, setQuery] = React.useState(`整骨院 ${clinic.short}`);
  const [results, setResults] = React.useState<ApiPlace[] | null>(null);
  const [manual, setManual] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const add = async (competitor: Record<string, unknown>) => {
    const r = await mutate("/api/reputation/competitors", { action: "add", competitor: { clinicId, ...competitor } });
    setMsg(r.ok ? { ok: true, text: `「${competitor.name}」を登録しました` } : { ok: false, text: r.error });
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      {runtime.placesConfigured ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const r = await mutate("/api/reputation/places-search", { query });
            setPending(false);
            if (!r.ok) return setMsg({ ok: false, text: r.error });
            setResults((r.data.places as ApiPlace[]) ?? []);
          }}
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputCls} aria-label="Googleマップで検索" />
          <Button size="sm" type="submit" variant="outline" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Search aria-hidden />} 検索
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-xs">Places APIのキーを設定すると、Googleマップから検索して登録・自動更新できます（README参照）。今は名前を手入力して登録できます。</p>
      )}
      {results && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
          {results.length === 0 && <li className="text-muted-foreground p-2 text-xs">見つかりませんでした</li>}
          {results.map((p) => (
            <li key={p.placeId} className="flex items-center gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {stars(p.rating)}・{num(p.reviewCount)}件 ・ {p.address}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => add({ name: p.name, placeId: p.placeId, address: p.address, mapsUri: p.mapsUri })}>
                登録
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!manual.trim()) return;
          await add({ name: manual.trim() });
          setManual("");
        }}
      >
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="競合の名前を手入力（例：〇〇整骨院 交野院）" className={inputCls} aria-label="競合の名前" />
        <Button size="sm" type="submit" variant="ghost">
          手入力で登録
        </Button>
      </form>
      <Msg msg={msg} />
    </div>
  );
}

function Competitors() {
  const { snapshot, mutate, runtime } = useCompany();
  const [clinicId, setClinicId] = React.useState(TENANT.clinics[0].id);
  const [recording, setRecording] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = React.useState(false);
  const row = snapshot.reputation.comparison.find((c) => c.clinicId === clinicId)!;
  const subjects = [
    { id: `clinic:${clinicId}`, name: `${row.name}（自院）`, own: true, mapsUri: undefined as string | undefined, ...row.own },
    ...row.competitors.map((c) => ({ ...c, own: false })),
  ];
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>地域の競合</CardTitle>
          <CardDescription>
            星・口コミ件数と、1か月の増加を比べます。Places APIで取得した数字はGoogleの規約に合わせて30日で消し、長期の推移は「記録」（人が確認した数字）で残します。
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm" aria-label="院">
            {TENANT.clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {runtime.placesConfigured && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const r = await mutate("/api/reputation/competitors", { action: "refresh" });
                setPending(false);
                setMsg(r.ok ? { ok: true, text: "最新の星・口コミ件数を取得しました" } : { ok: false, text: r.error });
              }}
            >
              <RefreshCw className={cn(pending && "animate-spin")} aria-hidden /> 最新を取得
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                {["店舗", "星の平均", "口コミ件数", "1か月の増加", "最終確認", ""].map((h, i) => (
                  <th key={i} scope="col" className={cn("px-2 py-2 font-medium whitespace-nowrap", i === 0 ? "pl-1 text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <React.Fragment key={s.id}>
                  <tr className={cn("border-b", s.own && "bg-secondary/60")}>
                    <th scope="row" className="py-2 pr-2 pl-1 text-left font-medium">
                      {s.name}
                      {"demo" in s && s.demo && (
                        <Badge variant="demo" className="ml-1 px-1 py-0 text-[10px]">
                          DEMO
                        </Badge>
                      )}
                      {s.mapsUri && (
                        <a href={s.mapsUri} target="_blank" rel="noreferrer" className="text-muted-foreground ml-1 inline-flex align-middle" aria-label="Googleマップで開く">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums">{stars(s.rating)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(s.reviewCount)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{signed(s.gainMonth)}</td>
                    <td className="text-muted-foreground px-2 py-2 text-right text-xs whitespace-nowrap">
                      {s.date ? `${s.date}（${s.source === "places" ? "自動" : s.source === "gbp" ? "プロフィール" : "記録"}）` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setRecording(recording === s.id ? null : s.id)}>
                        記録
                      </Button>
                      {!s.own && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`${s.name}を削除`}
                          onClick={async () => {
                            if (!window.confirm(`「${s.name}」を競合から外しますか？（記録も消えます）`)) return;
                            const r = await mutate("/api/reputation/competitors", { action: "remove", id: s.id });
                            setMsg(r.ok ? { ok: true, text: "外しました" } : { ok: false, text: r.error });
                          }}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {recording === s.id && (
                    <tr className="border-b">
                      <td colSpan={6} className="px-2 py-2">
                        <SnapshotForm subjectId={s.id} onDone={() => setRecording(null)} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Msg msg={msg} />
        <AddCompetitor key={clinicId} clinicId={clinicId} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const GOOGLE_RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Googleアカウントと接続しました。プロフィールと院の対応を確認してください。" },
  denied: { ok: false, text: "Googleの画面で許可されませんでした。" },
  state_mismatch: { ok: false, text: "接続の確認に失敗しました。もう一度「Googleアカウントで接続」からやり直してください。" },
  not_configured: { ok: false, text: "Google接続の設定（GOOGLE_OAUTH_CLIENT_ID など）がありません。README の手順で設定してください。" },
};

function Settings() {
  const { snapshot, runtime, mutate } = useCompany();
  const params = useSearchParams();
  const g = snapshot.reputation.google;
  const [pending, setPending] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(() => {
    const k = params.get("google");
    if (!k) return null;
    return k === "error" ? { ok: false, text: params.get("message") ?? "接続に失敗しました" } : (GOOGLE_RESULT[k] ?? null);
  });
  const live = snapshot.reputation.mode === "live";
  const call = async (key: string, path: string, done: string) => {
    setPending(key);
    const r = await mutate(path, {});
    setPending(null);
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Googleアカウント（ビジネスプロフィール）</CardTitle>
            <CardDescription>院のプロフィールのオーナーまたは管理者のGoogleアカウントで接続します。口コミ・表示回数は6時間ごとに自動で読み取ります（読み取りのみ。返信は承認後のみ投稿）。</CardDescription>
          </div>
          <Badge variant={g.connectedAt ? "secondary" : "outline"}>{g.connectedAt ? "接続中" : "未接続"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {g.connectedAt && (
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
              <dt className="text-muted-foreground">アカウント</dt>
              <dd>{g.email ?? "—"}</dd>
              <dt className="text-muted-foreground">接続日時</dt>
              <dd>{formatDateTime(g.connectedAt)}</dd>
              <dt className="text-muted-foreground">最後の読み取り</dt>
              <dd className={cn(g.lastStatus === "error" && "text-red-600")}>{g.lastSyncAt ? `${formatDateTime(g.lastSyncAt)}：${g.lastMessage ?? ""}` : "—"}</dd>
            </dl>
          )}
          {!runtime.googleOAuthConfigured && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              Google接続の設定がまだありません。Google Cloud でビジネスプロフィール API の利用申請と OAuth クライアントの作成を行い、`.env.local` に設定してください（README「Googleビジネスプロフィールの接続」）。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {g.connectedAt ? (
              <>
                <Button size="sm" disabled={pending !== null} onClick={() => call("sync", "/api/google/sync", "読み取りました")}>
                  {pending === "sync" ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} 今すぐ読み取る
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending !== null}
                  onClick={() => window.confirm("Googleアカウントとの接続を解除しますか？（取得済みの口コミ・数字は残ります）") && call("dis", "/api/google/disconnect", "接続を解除しました")}
                >
                  <Unplug aria-hidden /> 接続を解除
                </Button>
              </>
            ) : (
              <Button size="sm" asChild disabled={!runtime.googleOAuthConfigured}>
                <a href="/api/google/connect" aria-disabled={!runtime.googleOAuthConfigured}>
                  <Plug aria-hidden /> Googleアカウントで接続
                </a>
              </Button>
            )}
          </div>
          <Msg msg={msg} />
        </CardContent>
      </Card>

      {snapshot.reputation.locations.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>プロフィールと院の対応</CardTitle>
              <CardDescription>名前から自動で対応付けています。違っていれば選び直してください（院でないプロフィールは「対応なし」）。</CardDescription>
            </div>
            {!live && <Badge variant="demo">DEMO</Badge>}
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {snapshot.reputation.locations.map((l) => (
                <li key={l.name} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{l.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {stars(l.averageRating)}・{num(l.totalReviewCount)}件{l.address ? ` ・ ${l.address}` : ""}
                    </div>
                  </div>
                  <select
                    value={l.clinicId ?? ""}
                    disabled={!live}
                    onChange={async (e) => {
                      const r = await mutate("/api/reputation/locations", { locationName: l.name, clinicId: e.target.value });
                      setMsg(r.ok ? { ok: true, text: "対応を変更しました" } : { ok: false, text: r.error });
                    }}
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                    aria-label={`${l.title}の院`}
                  >
                    <option value="">対応なし</option>
                    {TENANT.clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>地域の競合（Places API）</CardTitle>
            <CardDescription>Googleマップの公開情報から、競合の星・口コミ件数を取得します（1日1回自動）。</CardDescription>
          </div>
          <Badge variant={runtime.placesConfigured ? "secondary" : "outline"}>{runtime.placesConfigured ? "設定済み" : "未設定"}</Badge>
        </CardHeader>
        <CardContent className="text-muted-foreground text-xs leading-relaxed">
          {runtime.placesConfigured
            ? "「地域の競合」タブで、Googleマップから検索して登録できます。"
            : "GOOGLE_MAPS_API_KEY を設定すると、検索・自動更新が使えます。未設定でも、名前の手入力と、星・件数の記録はできます。"}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>デモデータ</CardTitle>
            <CardDescription>Googleの承認が下りるまで、架空の口コミ・数字・競合で画面と流れを確認できます。本番の記録には触れません。</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => call("demo", "/api/reputation/demo", "デモデータ（架空）を作りました")}>
            デモデータを作る／作り直す
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ReputationView() {
  const { snapshot } = useCompany();
  const params = useSearchParams();
  const [tab, setTab] = React.useState<TabId>(params.get("google") ? "settings" : "overview");
  const r = snapshot.reputation;
  const empty = r.locations.length === 0 && r.reviews.length === 0 && r.comparison.every((c) => c.competitors.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            口コミ・MEO {r.mode === "demo" && !empty && <Badge variant="demo">DEMO（架空のデータ）</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Googleビジネスプロフィールの口コミ・表示回数と、地域の競合を院ごとに管理します。</p>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="口コミ・MEOのメニュー">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition", tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
          >
            {t.label}
            {t.id === "reviews" && r.stats.unreplied > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{r.stats.unreplied}</span>}
          </button>
        ))}
      </div>
      {empty && tab !== "settings" ? (
        <div className="text-muted-foreground space-y-3 rounded-xl border border-dashed p-8 text-center text-sm">
          <p>まだデータがありません。「接続・設定」でGoogleアカウントを接続するか、デモデータで画面を確認してください。</p>
          <Button size="sm" variant="outline" onClick={() => setTab("settings")}>
            接続・設定を開く
          </Button>
        </div>
      ) : (
        <>
          {tab === "overview" && <Overview go={setTab} />}
          {tab === "reviews" && <Reviews />}
          {tab === "performance" && <Performance />}
          {tab === "competitors" && <Competitors />}
          {tab === "settings" && <Settings />}
        </>
      )}
    </div>
  );
}
