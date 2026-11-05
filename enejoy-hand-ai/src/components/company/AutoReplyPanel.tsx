"use client";

import Link from "next/link";
import { CircleStop, LoaderCircle, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import type { AutoReplyJob } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Message, type Msg } from "./SheetImport";
import { useClinics, useCompany } from "./StateProvider";

const JOB_STATUS: Record<AutoReplyJob["status"], { label: string; cls: string }> = {
  scheduled: { label: "投稿予定", cls: "border-sky-400 text-sky-800 dark:text-sky-300" },
  posted: { label: "投稿済み", cls: "border-emerald-500 text-emerald-700 dark:text-emerald-400" },
  canceled: { label: "取りやめ", cls: "text-muted-foreground" },
  failed: { label: "失敗", cls: "border-red-400 text-red-600" },
  skipped: { label: "投稿なし", cls: "text-muted-foreground" },
};

const area = "focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]";

function JobRow({ job }: { job: AutoReplyJob }) {
  const { mutate } = useCompany();
  const clinics = useClinics();
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(job.comment);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const call = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const r = await mutate("/api/reputation/auto-reply", body);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    return r.ok;
  };
  const st = JOB_STATUS[job.status];
  return (
    <li className="space-y-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={st.cls}>
          {st.label}
        </Badge>
        <span className="font-medium">{clinics.find((c) => c.id === job.clinicId)?.name ?? "院"}</span>
        <span className="text-amber-500">{"★".repeat(job.rating)}</span>
        <span className="text-muted-foreground text-xs">
          {job.status === "scheduled" ? `${formatDateTime(job.dueAt)} 以降に投稿` : job.postedAt ? `${formatDateTime(job.postedAt)} 投稿` : formatDateTime(job.createdAt)}
        </span>
      </div>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} aria-label="返信文" className={area} />
      ) : (
        <p className="bg-secondary/50 rounded-md p-2 text-xs whitespace-pre-wrap">{job.comment}</p>
      )}
      {job.message && <p className="text-muted-foreground text-xs">{job.message}</p>}
      {job.status === "scheduled" && (
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  if (await call({ action: "edit_job", id: job.id, comment: text }, "返信文を書き換えました")) setEditing(false);
                }}
              >
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                やめる
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              書き換える
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (window.confirm("この返信の投稿を取りやめますか？（必要なら「口コミ」から承認制で返信してください）")) await call({ action: "cancel_job", id: job.id }, "取りやめました");
            }}
          >
            取りやめる
          </Button>
        </div>
      )}
      <Message msg={msg} />
    </li>
  );
}

export function AutoReplyPanel() {
  const { snapshot, mutate } = useCompany();
  const r = snapshot.reputation;
  const s = r.autoReply;
  const [form, setForm] = React.useState(() => ({
    minRating: s.minRating,
    includeNoComment: s.includeNoComment,
    includeBacklog: s.includeBacklog,
    delayHours: s.delayHours,
    dailyLimit: s.dailyLimit,
    high: s.templates.high,
    mid: s.templates.mid,
    stopWords: s.stopWords.join("、"),
  }));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const call = async (k: string, body: Record<string, unknown>, ok: string) => {
    setBusy(k);
    const res = await mutate("/api/reputation/auto-reply", body);
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: ok } : { ok: false, text: res.error });
    return res;
  };
  const connected = Boolean(r.google.connectedAt);
  const scheduled = r.autoReplyJobs.filter((j) => j.status === "scheduled");
  const setList = (k: "high" | "mid", i: number, v: string) => setForm((f) => ({ ...f, [k]: f[k].map((x, j) => (j === i ? v : x)) }));

  return (
    <div className="space-y-6">
      <Card className={cn(s.enabled && "border-emerald-400 dark:border-emerald-700")}>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              口コミの自動返信
              {s.enabled ? <Badge className="bg-emerald-600 text-white">有効</Badge> : <Badge variant="outline">停止中</Badge>}
              {r.autoReplyPendingApprovalId && <Badge className="bg-amber-500 text-white">有効化の承認待ち</Badge>}
              {!connected && <Badge variant="outline">Google未接続</Badge>}
            </CardTitle>
            <CardDescription>
              Googleビジネスプロフィールの口コミのうち、ルールに合うものに自動で返信します。★2以下と、不満の言葉がある口コミは自動返信せず、これまでどおり返信案 → 承認で返信します。返信文に口コミの本文（症状・来院日など）は引用しません。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.enabled && (
              <Button
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={async () => {
                  if (window.confirm("自動返信を止めますか？（投稿予定の返信もすべて取りやめます）")) await call("stop", { action: "stop" }, "自動返信を止めました");
                }}
              >
                <CircleStop aria-hidden /> すぐに止める
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy !== null || !s.enabled} onClick={() => call("run", { action: "run" }, "新しい口コミを確認しました")}>
              {busy === "run" ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} 今すぐ確認
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {s.enabled ? (
            <p>
              {s.approvedAt && `${formatDateTime(s.approvedAt)} に承認されて有効。`}★{s.minRating}以上・投稿まで{s.delayHours}時間待つ・1日{s.dailyLimit}件まで。口コミの取り込み（6時間ごと）のあとと、10分ごとに確認します。
            </p>
          ) : (
            <p className="text-muted-foreground">
              {s.stoppedAt ? `${formatDateTime(s.stoppedAt)} に止めました。` : ""}下のルールを確認して「有効化の承認を依頼」を押してください。承認されると動き始めます（会社の名前で公開される返信なので、代表にも回すことを推奨します）。
            </p>
          )}
          {!connected && (
            <p className="text-amber-700 dark:text-amber-400">
              Googleアカウントが未接続です。「接続・設定」でGoogleビジネスプロフィールを接続すると、実際の口コミに返信できます（未接続の間は投稿せずに待機します）。
            </p>
          )}
          {r.autoReplyPendingApprovalId && (
            <Link href="/approvals" className="text-brand font-medium hover:underline">
              有効化の承認待ちです → 承認画面へ
            </Link>
          )}
          <Message msg={msg} />
        </CardContent>
      </Card>

      {scheduled.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>投稿予定の返信（{scheduled.length}件）</CardTitle>
              <CardDescription>待ち時間が過ぎると投稿されます。気になるものは書き換えるか取りやめてください。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {scheduled.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>ルール</CardTitle>
            <CardDescription>ルールを変えたときは、もう一度承認を受けてから有効になります（承認されるまでは今のルールのまま、または停止のまま）。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="text-xs font-medium">
              対象の評価
              <select
                value={form.minRating}
                onChange={(e) => setForm({ ...form, minRating: Number(e.target.value) })}
                className="bg-background mt-1 block h-9 rounded-md border px-2 text-sm"
              >
                <option value={5}>★5だけ</option>
                <option value={4}>★4以上</option>
                <option value={3}>★3以上</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              投稿までの待ち時間（時間）
              <input
                type="number"
                min={0}
                max={72}
                value={form.delayHours}
                onChange={(e) => setForm({ ...form, delayHours: Number(e.target.value) })}
                className="focus-visible:ring-ring/50 mt-1 block h-9 w-24 rounded-md border bg-transparent px-2 text-right text-sm outline-none focus-visible:ring-[3px]"
              />
            </label>
            <label className="text-xs font-medium">
              1日の上限（件）
              <input
                type="number"
                min={1}
                max={50}
                value={form.dailyLimit}
                onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })}
                className="focus-visible:ring-ring/50 mt-1 block h-9 w-24 rounded-md border bg-transparent px-2 text-right text-sm outline-none focus-visible:ring-[3px]"
              />
            </label>
            <label className="flex items-center gap-1.5 self-end pb-2 text-xs">
              <input type="checkbox" checked={form.includeNoComment} onChange={(e) => setForm({ ...form, includeNoComment: e.target.checked })} />
              ★だけ（本文なし）の口コミにも返信
            </label>
            <label className="flex items-center gap-1.5 self-end pb-2 text-xs">
              <input type="checkbox" checked={form.includeBacklog} onChange={(e) => setForm({ ...form, includeBacklog: e.target.checked })} />
              今ある未返信の口コミにも返信
            </label>
          </div>

          {(["high", "mid"] as const).map((k) =>
            k === "mid" && form.minRating > 3 ? null : (
              <section key={k} className="space-y-2">
                <h3 className="text-sm font-semibold">{k === "high" ? "★4〜5への返信文" : "★3への返信文"}（{"{お名前}"}・{"{院名}"} が置き換わります。複数あれば順番に使います）</h3>
                {form[k].map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <textarea value={t} onChange={(e) => setList(k, i, e.target.value)} rows={4} maxLength={1000} aria-label={`${k === "high" ? "★4〜5" : "★3"}の返信文${i + 1}`} className={area} />
                    <Button size="icon" variant="ghost" aria-label="この返信文を外す" disabled={k === "high" && form.high.length <= 1} onClick={() => setForm((f) => ({ ...f, [k]: f[k].filter((_, j) => j !== i) }))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
                {form[k].length < 5 && (
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, [k]: [...f[k], "{お名前}様\n{院名}をご利用いただき、ありがとうございます。"] }))}>
                    <Plus aria-hidden /> 返信文を追加
                  </Button>
                )}
              </section>
            ),
          )}

          <label className="block text-xs font-medium">
            自動返信しない言葉（読点「、」区切り。口コミの本文にあれば人の確認に回します）
            <textarea value={form.stopWords} onChange={(e) => setForm({ ...form, stopWords: e.target.value })} rows={2} className={cn(area, "mt-1")} />
          </label>

          <Button
            size="sm"
            disabled={busy !== null || Boolean(r.autoReplyPendingApprovalId)}
            onClick={async () => {
              const body = {
                action: "request",
                minRating: form.minRating,
                includeNoComment: form.includeNoComment,
                includeBacklog: form.includeBacklog,
                delayHours: form.delayHours,
                dailyLimit: form.dailyLimit,
                templates: { high: form.high.map((x) => x.trim()).filter(Boolean), mid: form.minRating > 3 ? [] : form.mid.map((x) => x.trim()).filter(Boolean) },
                stopWords: form.stopWords.split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean),
              };
              await call("request", body, "有効化の承認を依頼しました。承認画面で判断してください（代表へ回すこともできます）。");
            }}
          >
            {busy === "request" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />} {s.enabled ? "ルールの変更を承認依頼" : "有効化の承認を依頼"}
          </Button>
        </CardContent>
      </Card>

      {r.autoReplyJobs.some((j) => j.status !== "scheduled") && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>自動返信の記録（直近）</CardTitle>
              <CardDescription>投稿・取りやめ・失敗の記録。すべて監査ログにも残ります。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {r.autoReplyJobs
                .filter((j) => j.status !== "scheduled")
                .slice(0, 10)
                .map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
