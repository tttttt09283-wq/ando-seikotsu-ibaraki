"use client";

/**
 * 販売用テンプレートの「差し込み」
 * 院名・チェックページのURL・特典を入力すると、SNS投稿文や店頭テンプレートの文中に自動で入ります。
 * 入力内容はこのブラウザの中だけに保存します（サーバーには送りません）。
 */
import QRCode from "qrcode";
import { createContext, useContext, useEffect, useState } from "react";
import { salesConfig } from "@/config/sales";

export interface PersonalizeValues {
  clinicName: string;
  checkUrl: string;
  benefit: string;
  tel: string;
}

const KEY = "ando-body-check:sales-personalize:v1";
const DEFAULTS: PersonalizeValues = {
  clinicName: "〇〇整骨院",
  checkUrl: salesConfig.appUrl,
  benefit: "結果画面のご提示で、初回の身体チェック（約20分）を無料",
  tel: "",
};

const Ctx = createContext<{ v: PersonalizeValues; set: (patch: Partial<PersonalizeValues>) => void }>({
  v: DEFAULTS,
  set: () => {},
});

export function PersonalizeProvider({ children }: { children: React.ReactNode }) {
  const [v, setV] = useState<PersonalizeValues>(DEFAULTS);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) || "null");
      if (saved && typeof saved === "object") setV({ ...DEFAULTS, ...saved });
    } catch {
      // 保存できない環境でも、初期値で表示する
    }
  }, []);
  const set = (patch: Partial<PersonalizeValues>) =>
    setV((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // 保存できなくても表示は続ける
      }
      return next;
    });
  return <Ctx.Provider value={{ v, set }}>{children}</Ctx.Provider>;
}

export function usePersonalize() {
  return useContext(Ctx);
}

/** 文中の {院名} {URL} {特典} {電話} を入力内容に置き換える */
export function fill(text: string, v: PersonalizeValues): string {
  return text
    .replaceAll("{院名}", v.clinicName || "〇〇整骨院")
    .replaceAll("{URL}", v.checkUrl || salesConfig.appUrl)
    .replaceAll("{特典}", v.benefit || "")
    .replaceAll("{電話}", v.tel || "（電話番号）");
}

export function PersonalizeForm() {
  const { v, set } = usePersonalize();
  const field = (key: keyof PersonalizeValues, label: string, placeholder: string, type = "text") => (
    <label className="block text-sm font-bold text-navy-700">
      {label}
      <input
        type={type}
        value={v[key]}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
        className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base font-medium text-navy-900 focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
  return (
    <div className="no-print rounded-3xl border-2 border-brand-200 bg-white p-5">
      <p className="text-base font-black text-navy-900">✏️ 貴院の情報を入れると、下の文章・テンプレートに自動で入ります</p>
      <p className="mt-1 text-xs text-slate-600">入力内容はこのブラウザの中だけに保存されます（どこにも送信されません）。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {field("clinicName", "院名", "例：〇〇整骨院")}
        {field("checkUrl", "チェックページのURL（導入後に発行されるURL）", "https://…", "url")}
        {field("benefit", "特典（任意）", "例：結果画面のご提示で初回検査無料")}
        {field("tel", "電話番号（任意）", "例：06-0000-0000", "tel")}
      </div>
    </div>
  );
}

/** QRコード（ブラウザ内で作成。外部サービスは使わない） */
export function QrImage({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value || salesConfig.appUrl, { width: size * 2, margin: 1, color: { dark: "#1e3a5f", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div className={className} style={{ width: size, height: size }} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={`QRコード：${value}`} className={className} />;
}

/** コピーボタン（押すとクリップボードに入る） */
export function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1800);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="no-print inline-flex items-center gap-1 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-bold text-white active:bg-brand-700"
    >
      {done ? "✅ コピーしました" : `📋 ${label}`}
    </button>
  );
}
