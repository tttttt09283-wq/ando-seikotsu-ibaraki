"use client";

import { useCallback, useEffect, useState } from "react";

type View = {
  code: string;
  status: string;
  statusLabel: string;
  provisional: boolean;
  lineReceived: boolean;
  lineAutoConfirm: boolean;
  locationName: string;
  when: string;
  previousWhen: string | null;
  menu: string;
  price: number;
  duration: number;
  holdExpiresAt: string | null;
  canCancel: boolean;
  lineChatUrl: string | null;
};

export default function StatusView({ code, token }: { code: string; token: string }) {
  const [view, setView] = useState<View | null | "notfound">(null);
  const [line, setLine] = useState<{ prefill: string; lineUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/reservations/status?c=${encodeURIComponent(code)}&t=${encodeURIComponent(token)}`, { cache: "no-store" });
    setView(r.ok ? await r.json() : "notfound");
  }, [code, token]);

  useEffect(() => {
    load();
    try {
      const s = sessionStorage.getItem(`iw_line_${code}`);
      if (s) setLine(JSON.parse(s));
    } catch {}
  }, [code, load]);

  // LINE送信待ちの間は自動で状況を更新
  useEffect(() => {
    if (!view || view === "notfound" || view.status !== "pending_line") return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [view, load]);

  if (view === null) return <p className="text-sm text-mist">読み込んでいます…</p>;
  if (view === "notfound") return <p className="text-sm text-mist">予約が見つかりません。URLをご確認ください。</p>;

  const tone = view.status === "confirmed" || view.status === "completed" ? "border-ok text-ok" : view.provisional ? "border-ink" : "border-line text-mist";

  async function cancel() {
    if (!confirm("この仮予約を取り消します。よろしいですか？")) return;
    setBusy(true);
    await fetch("/api/reservations/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: code, t: token }) });
    setBusy(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className={`border p-5 ${tone}`}>
        <p className="text-xs tracking-[0.2em] text-mist">予約番号 {view.code}</p>
        <p className="mt-1 font-serif text-lg tracking-[0.08em]">{view.statusLabel}</p>
        {view.provisional && <p className="mt-2 text-sm text-ink-soft">この予約はまだ確定していません。確定のご連絡は公式LINEでお送りします。</p>}
        {view.status === "pending_line" && (
          <p className="mt-2 text-sm text-ink-soft">
            公式LINEでの送信をお待ちしています。
            {!view.lineAutoConfirm && "（送信いただいた内容は担当者が確認します。この画面には自動では反映されません）"}
          </p>
        )}
        {view.status === "pending_review" && <p className="mt-2 text-sm text-ink-soft">LINEでの受付を確認しました。内容を確認し、確定のご連絡をいたします。</p>}
        {view.status === "change_proposed" && <p className="mt-2 text-sm text-ink-soft">日時の変更をご提案しています。公式LINEをご確認のうえ、ご返信ください。</p>}
        {view.status === "expired" && <p className="mt-2 text-sm text-ink-soft">受付期限を過ぎたため、この仮予約は無効になりました。お手数ですが、もう一度お申し込みください。</p>}
      </div>

      <dl className="divide-y divide-line border-y border-line text-sm">
        <Row k="施術場所" v={view.locationName} />
        <Row k={view.status === "change_proposed" ? "ご提案の日時" : "日時"} v={view.when} />
        {view.previousWhen && view.status === "change_proposed" && <Row k="当初のご希望" v={view.previousWhen} />}
        <Row k="メニュー" v={view.menu} />
        <Row k="施術時間" v={`${view.duration}分`} />
        <Row k="料金" v={`${view.price.toLocaleString("ja-JP")}円（税込）`} />
      </dl>

      {view.status === "pending_line" && line && (
        <div className="space-y-3">
          {line.lineUrl && (
            <a href={line.lineUrl} className="block bg-[#06C755] px-5 py-4 text-center text-sm font-bold tracking-[0.12em] text-white">
              LINEで送信する
            </a>
          )}
          <textarea readOnly value={line.prefill} rows={7} className="w-full border border-line bg-stone p-3 text-xs" />
          <button type="button" onClick={() => navigator.clipboard?.writeText(line.prefill)} className="w-full border border-ink px-4 py-3 text-sm">
            内容をコピーする
          </button>
        </div>
      )}
      {view.lineChatUrl && (
        <a href={view.lineChatUrl} className="block border border-line px-4 py-3 text-center text-sm">
          公式LINEを開く（変更・キャンセルのご連絡）
        </a>
      )}
      {view.canCancel && (
        <button type="button" disabled={busy} onClick={cancel} className="w-full px-4 py-3 text-sm text-mist underline">
          この仮予約を取り消す
        </button>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-mist">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
