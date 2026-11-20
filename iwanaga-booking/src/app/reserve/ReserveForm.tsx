"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicCatalog } from "@/lib/services/reservations";
import LineSendButton from "@/components/LineSendButton";

const CONSULTATION_MAX = 200;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

type Result = {
  ok: true;
  code: string;
  viewToken: string;
  verifyCode: string;
  linePrefill: string;
  lineUrl: string | null;
  lineAutoConfirm: boolean;
  holdExpiresAt: string;
};

declare global {
  interface Window {
    liff?: { init: (o: { liffId: string }) => Promise<void>; isLoggedIn: () => boolean; getIDToken: () => string | null };
  }
}

function yen(n: number) {
  return `${n.toLocaleString("ja-JP")}円`;
}
function dateLabel(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { md: `${m}/${day}`, w: WEEK[w], sun: w === 0, sat: w === 6 };
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function addMin(hhmm: string, m: number) {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = h * 60 + mm + m;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const DRAFT_KEY = "iw_reserve_draft"; // 入力中（draft）の選択だけをこのタブ内に保存。氏名・電話は保存しない

export default function ReserveForm({ catalog, source, liffId }: { catalog: PublicCatalog; source: string | null; liffId: string | null }) {
  const [locationId, setLocationId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [dates, setDates] = useState<string[] | null>(null);
  const [date, setDate] = useState<string>("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consultation, setConsultation] = useState("");
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeCancel, setAgreeCancel] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const liffToken = useRef<string | null>(null);
  const restored = useRef(false);

  const loc = catalog.find((l) => l.id === locationId) ?? null;
  const svc = loc?.services.find((s) => s.id === serviceId) ?? null;
  const anyAccepting = catalog.some((l) => l.accepting);

  // 入力中の選択を復元
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as { locationId?: string; serviceId?: string } | null;
      if (d?.locationId && catalog.find((l) => l.id === d.locationId && l.accepting)) {
        setLocationId(d.locationId);
        if (d.serviceId) setServiceId(d.serviceId);
      }
    } catch {}
    restored.current = true;
  }, [catalog]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ locationId, serviceId }));
    } catch {}
  }, [locationId, serviceId]);

  useEffect(() => {
    setDates(null);
    setDate("");
    if (!locationId || !serviceId) return;
    let alive = true;
    fetch(`/api/availability?location=${encodeURIComponent(locationId)}&service=${encodeURIComponent(serviceId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setDates(j.dates ?? []))
      .catch(() => alive && setDates([]));
    return () => {
      alive = false;
    };
  }, [locationId, serviceId]);

  useEffect(() => {
    setSlots(null);
    setTime("");
    if (!date || !locationId || !serviceId) return;
    let alive = true;
    fetch(`/api/availability?location=${encodeURIComponent(locationId)}&service=${encodeURIComponent(serviceId)}&date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setSlots(j.slots ?? []))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [date, locationId, serviceId]);

  const byMonth = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of dates ?? []) {
      const k = d.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()];
  }, [dates]);

  const ready = Boolean(loc && svc && date && time && name.trim() && phone.trim() && agreePrivacy && agreeCancel);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !ready) return;
    setSubmitting(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          service_id: serviceId,
          date,
          time,
          name,
          phone,
          consultation,
          agree_privacy: agreePrivacy,
          agree_cancel_policy: agreeCancel,
          source: source ?? undefined,
          liff_id_token: liffToken.current ?? undefined,
          website,
        }),
      });
      const j = await res.json();
      if (j.ok) {
        setResult(j as Result);
        try {
          sessionStorage.removeItem(DRAFT_KEY);
          sessionStorage.setItem(`iw_line_${j.code}`, JSON.stringify({ prefill: j.linePrefill, lineUrl: j.lineUrl }));
        } catch {}
        window.scrollTo({ top: 0 });
      } else {
        setErrors(j.errors ?? {});
        setMessage(j.message ?? "受付できませんでした。");
        if (j.errors?.time) {
          // 枠が埋まった場合は空き状況を取り直す
          setSlots(null);
          const d = date;
          setDate("");
          setTimeout(() => setDate(d), 0);
        }
      }
    } catch {
      setMessage("通信に失敗しました。電波の良い場所でもう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.linePrefill);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (result) {
    const statusUrl = `/reserve/status?c=${encodeURIComponent(result.code)}&t=${encodeURIComponent(result.viewToken)}`;
    return (
      <div className="space-y-6">
        <div className="border border-ink p-5">
          <p className="text-xs tracking-[0.2em] text-mist">仮予約の受付</p>
          <p className="mt-1 font-serif text-xl tracking-[0.1em]">まだ予約は確定していません</p>
          <p className="mt-3 text-sm text-ink-soft">
            予約番号 <span className="font-mono text-base text-ink">{result.code}</span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {fmtTime(result.holdExpiresAt)} までに、次の手順で公式LINEから送信してください。期限を過ぎると、この仮予約は自動的に取り消されます。
          </p>
        </div>

        <ol className="space-y-5">
          <li>
            <p className="text-sm font-medium">1. 公式LINEを開いて、表示された内容をそのまま「送信」してください</p>
            {result.lineUrl ? (
              <LineSendButton url={result.lineUrl} />
            ) : (
              <p className="mt-2 text-xs text-mist">公式LINEのトーク画面を開き、下の内容を貼り付けて送信してください。</p>
            )}
            <p className="mt-2 text-xs text-mist">※ LINEを開いただけでは受付は完了しません。必ず送信ボタンを押してください。</p>
          </li>
          <li>
            <p className="text-sm font-medium">2. うまく開けない場合は、内容をコピーして送信</p>
            <textarea readOnly value={result.linePrefill} rows={8} className="mt-2 w-full border border-line bg-stone p-3 text-xs leading-relaxed" />
            <button type="button" onClick={copy} className="mt-2 w-full border border-ink px-4 py-3 text-sm tracking-[0.12em]">
              {copied ? "コピーしました" : "内容をコピーする"}
            </button>
          </li>
          <li>
            <p className="text-sm font-medium">3. 確定のご連絡をお待ちください</p>
            <p className="mt-1 text-sm text-ink-soft">
              {result.lineAutoConfirm
                ? "LINEで送信が確認できると、自動で「受付確認済み」の返信が届きます。その後、内容を確認して予約確定のご連絡をいたします。"
                : "送信いただいた内容を担当者が確認し、公式LINEで予約確定のご連絡をいたします。（自動の受付確認は行っていません）"}
            </p>
          </li>
        </ol>
        <Link href={statusUrl} className="block border border-line px-4 py-3 text-center text-sm">
          予約状況を確認する
        </Link>
        <p className="text-xs text-mist">予約状況ページのURLはご本人だけが見られるよう、他の方に共有しないでください。</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-10" noValidate>
      {liffId && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          strategy="afterInteractive"
          onLoad={async () => {
            try {
              if (!window.liff || !/Line\//i.test(navigator.userAgent)) return;
              await window.liff.init({ liffId });
              if (window.liff.isLoggedIn()) liffToken.current = window.liff.getIDToken();
            } catch {}
          }}
        />
      )}
      {!anyAccepting && (
        <div className="border border-line bg-stone px-4 py-4 text-sm text-ink-soft">
          現在、すべての施術場所で予約の受付準備中です。受付開始まで今しばらくお待ちください。
        </div>
      )}

      <Step n={1} title="施術場所">
        <div className="grid gap-3">
          {catalog.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={!l.accepting}
              onClick={() => {
                setLocationId(l.id);
                setServiceId("");
              }}
              aria-pressed={locationId === l.id}
              className={`border px-4 py-4 text-left transition ${
                locationId === l.id ? "border-ink bg-ink text-paper" : l.accepting ? "border-line hover:border-ink" : "cursor-not-allowed border-line bg-stone text-mist"
              }`}
            >
              <span className="block font-serif tracking-[0.08em]">{l.name}</span>
              <span className={`mt-1 block text-xs ${locationId === l.id ? "text-paper/70" : "text-mist"}`}>{l.accepting ? l.public_area : l.closed_reason}</span>
            </button>
          ))}
        </div>
        <FieldError msg={errors.location_id} />
      </Step>

      {loc && (
        <Step n={2} title="メニュー">
          {loc.services.length === 0 ? (
            <p className="text-sm text-mist">現在ご予約いただけるメニューはありません。</p>
          ) : (
            <div className="grid gap-3">
              {loc.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  aria-pressed={serviceId === s.id}
                  className={`border px-4 py-4 text-left ${serviceId === s.id ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-base tracking-[0.08em]">{s.name}</span>
                    <span className="tabular-nums">
                      {yen(s.price_tax_included)}
                      <span className={`text-xs ${serviceId === s.id ? "text-paper/70" : "text-mist"}`}>（税込）</span>
                    </span>
                  </span>
                  <span className={`mt-1 block text-xs ${serviceId === s.id ? "text-paper/70" : "text-mist"}`}>
                    施術時間 {s.duration_minutes}分{s.description ? ` ・ ${s.description}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          <FieldError msg={errors.service_id} />
        </Step>
      )}

      {loc && svc && (
        <Step n={3} title="ご希望の日にち">
          {dates === null ? (
            <p className="text-sm text-mist">空き状況を確認しています…</p>
          ) : dates.length === 0 ? (
            <p className="text-sm text-mist">現在ご予約いただける日にちがありません。</p>
          ) : (
            <div className="space-y-4">
              {byMonth.map(([month, ds]) => (
                <div key={month}>
                  <p className="mb-2 text-xs text-mist">{Number(month.slice(5))}月</p>
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                    {ds.map((d) => {
                      const l = dateLabel(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDate(d)}
                          aria-pressed={date === d}
                          className={`border py-2 text-center text-sm ${date === d ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
                        >
                          <span className="block tabular-nums">{l.md}</span>
                          <span className={`block text-[11px] ${date === d ? "text-paper/70" : l.sun ? "text-ng" : l.sat ? "text-[#2b4a7a]" : "text-mist"}`}>{l.w}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-mist">
            受付締切：ご希望時刻の{loc.booking_deadline_hours}時間前まで ・ {loc.max_advance_days}日先までご予約いただけます
          </p>
          <FieldError msg={errors.date} />
        </Step>
      )}

      {svc && date && (
        <Step n={4} title="ご希望の時間">
          {slots === null ? (
            <p className="text-sm text-mist">空き状況を確認しています…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-mist">この日は空きがありません。別の日をお選びください。</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTime(t)}
                  aria-pressed={time === t}
                  className={`border py-3 text-center text-sm tabular-nums ${time === t ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <FieldError msg={errors.time} />
        </Step>
      )}

      {svc && date && time && (
        <>
          <Step n={5} title="お客様の情報">
            <div className="space-y-5">
              <label className="block">
                <span className="text-sm">
                  お名前 <Req />
                </span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} className="mt-1 w-full border border-line px-3 py-3 focus:border-ink" />
                <FieldError msg={errors.name} />
              </label>
              <label className="block">
                <span className="text-sm">
                  電話番号 <Req />
                </span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="09012345678" className="mt-1 w-full border border-line px-3 py-3 focus:border-ink" />
                <FieldError msg={errors.phone} />
              </label>
              <label className="block">
                <span className="text-sm">
                  ご相談内容 <span className="text-xs text-mist">（任意）</span>
                </span>
                <textarea
                  value={consultation}
                  onChange={(e) => setConsultation(e.target.value.slice(0, CONSULTATION_MAX))}
                  rows={3}
                  className="mt-1 w-full border border-line px-3 py-3 focus:border-ink"
                  placeholder="例：肩まわりのこり"
                />
                <span className="mt-1 flex justify-between text-xs text-mist">
                  <span>詳しい症状や病歴はご来院時に伺います。ここでは簡単で大丈夫です。</span>
                  <span className="tabular-nums">
                    {consultation.length}/{CONSULTATION_MAX}
                  </span>
                </span>
                <FieldError msg={errors.consultation} />
              </label>
              <label className="hidden" aria-hidden>
                website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
          </Step>

          <Step n={6} title="ご確認">
            {loc && svc && (
              <dl className="divide-y divide-line border-y border-line text-sm">
                <Row k="施術場所" v={loc.name} />
                <Row k="メニュー" v={svc.name} />
                <Row k="日時" v={`${dateLabel(date).md}(${dateLabel(date).w}) ${time}〜${addMin(time, svc.duration_minutes)}`} />
                <Row k="施術時間" v={`${svc.duration_minutes}分`} />
                <Row k="料金" v={`${yen(svc.price_tax_included)}（税込）`} />
              </dl>
            )}
            {loc && (
              <div className="mt-5 space-y-4">
                <details className="border border-line px-4 py-3 text-xs leading-relaxed text-ink-soft">
                  <summary className="cursor-pointer text-sm text-ink">個人情報の取扱い（{loc.short_name}）</summary>
                  <p className="mt-2">
                    <span className="text-mist">管理主体：</span>
                    {loc.controller_name}
                  </p>
                  <p className="mt-1">
                    <span className="text-mist">利用目的：</span>
                    {loc.privacy_purpose}
                  </p>
                  <p className="mt-1">
                    <span className="text-mist">閲覧できる人・保管：</span>
                    {loc.privacy_access}
                  </p>
                  <Link href="/privacy" target="_blank" className="mt-2 inline-block underline">
                    詳しく見る
                  </Link>
                </details>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="mt-1 size-5 accent-ink" />
                  <span>
                    個人情報の取扱いに同意します <Req />
                  </span>
                </label>
                <FieldError msg={errors.agree_privacy} />
                <details className="border border-line px-4 py-3 text-xs leading-relaxed text-ink-soft">
                  <summary className="cursor-pointer text-sm text-ink">キャンセル規定</summary>
                  <p className="mt-2 whitespace-pre-wrap">{loc.cancel_policy || "ご予約の変更・キャンセルは公式LINEでご連絡ください。"}</p>
                </details>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={agreeCancel} onChange={(e) => setAgreeCancel(e.target.checked)} className="mt-1 size-5 accent-ink" />
                  <span>
                    キャンセル規定に同意します <Req />
                  </span>
                </label>
                <FieldError msg={errors.agree_cancel_policy} />
              </div>
            )}
          </Step>

          {message && <p className="border border-[#e4c3c3] bg-[#fbf1f1] px-4 py-3 text-sm text-ng">{message}</p>}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={!ready || submitting}
              className="w-full bg-ink px-5 py-4 text-sm tracking-[0.2em] text-paper disabled:cursor-not-allowed disabled:bg-stone-2 disabled:text-mist"
            >
              {submitting ? "送信しています…" : "仮予約を申し込む"}
            </button>
            <p className="text-center text-xs text-mist">送信後、公式LINEでの送信と、担当者の確認をもってご予約が確定します。</p>
          </div>
        </>
      )}
    </form>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
        <span className="font-serif text-xs tracking-brand text-mist">STEP {n}</span>
        <span className="font-serif text-base tracking-[0.12em]">{title}</span>
      </h2>
      {children}
    </section>
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
function Req() {
  return <span className="ml-1 border border-ink px-1 text-[10px] tracking-normal">必須</span>;
}
function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-ng">{msg}</p> : null;
}
