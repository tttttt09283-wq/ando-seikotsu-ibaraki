"use client";

/**
 * シェアされたURL（/s?ref=紹介コード）を開いた人の最初の画面
 * 「〇〇さんから届きました（姿勢・体幹年齢 〇歳）」→ LINE友だち追加（必須）→ チェックを始める
 *
 * LINE友だち追加の確かめ方
 *  ・LIFF ID を設定している場合（siteConfig.liffId）：LINEでログインしてもらい、公式アカウントの友だちかどうかを確認。
 *    友だちでなければ始められません（友だち追加 →「追加したので確認する」）。
 *  ・未設定の場合：「① 友だち追加」のボタンを押してから「② 始める」が押せる流れ（追加したかは確かめられません）。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Footer, Spinner } from "@/components/ui";
import { buttonStyles, cx } from "@/components/styles";
import { fetchSharedResult, readRef } from "@/lib/tally";

type Liff = {
  init: (o: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (o?: { redirectUri?: string }) => void;
  getFriendship: () => Promise<{ friendFlag: boolean }>;
  openWindow: (o: { url: string; external?: boolean }) => void;
  isInClient: () => boolean;
};
declare global {
  interface Window {
    liff?: Liff;
  }
}

/** LIFFのSDKを読み込む（設定しているときだけ） */
function loadLiff(): Promise<Liff> {
  return new Promise((resolve, reject) => {
    if (window.liff) return resolve(window.liff);
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = () => (window.liff ? resolve(window.liff) : reject(new Error("LIFF not loaded")));
    s.onerror = () => reject(new Error("LIFF load error"));
    document.head.appendChild(s);
  });
}

type Gate = "checking" | "need_friend" | "ok" | "simple";

export function ShareLanding() {
  const router = useRouter();
  const [ref, setRef] = useState<string | null>(null);
  const [shared, setShared] = useState<{ nickname: string | null; body_age: number | null } | null>(null);
  const [gate, setGate] = useState<Gate>(siteConfig.liffId ? "checking" : "simple");
  const [addedClicked, setAddedClicked] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const r = readRef(window.location.search);
    setRef(r);
    if (r) void fetchSharedResult(r).then(setShared);
  }, []);

  // LIFF：ログイン → 友だちかどうかを確認
  const checkFriend = async () => {
    setMsg("");
    try {
      const liff = await loadLiff();
      await liff.init({ liffId: siteConfig.liffId });
      // LIFFで開いた場合、紹介コードはログイン後のURLに付いてくる
      const r = readRef(window.location.search);
      if (r) {
        setRef(r);
        if (!shared) void fetchSharedResult(r).then(setShared);
      }
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const f = await liff.getFriendship();
      setGate(f.friendFlag ? "ok" : "need_friend");
      if (!f.friendFlag) setMsg("");
    } catch {
      // LINEの設定がうまくいっていない場合でも止めない（友だち追加を案内する流れにする）
      setGate("simple");
    }
  };
  useEffect(() => {
    if (siteConfig.liffId) void checkFriend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => router.push(`/check?src=share${ref ? `&ref=${ref}` : ""}`);
  const who = shared?.nickname ? `${shared.nickname}さん` : "お友達・ご家族";

  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden rounded-b-[2.5rem] bg-gradient-to-b from-brand-500 to-brand-600 px-5 pb-8 pt-8 text-center text-white">
        <p className="text-sm font-bold">
          <span className="rounded-full bg-white/20 px-3 py-1">💌 {who}から届きました</span>
        </p>
        {shared?.body_age ? (
          <p className="mt-4 text-base font-bold">
            {who}の姿勢・体幹年齢は
            <span className="mx-1 text-3xl font-black text-sun-300">{shared.body_age}歳</span>
            でした！
          </p>
        ) : null}
        <h1 className="mt-3 text-[2rem] font-black leading-tight">
          あなたの姿勢・体幹は
          <br />
          <span className="text-sun-300">何歳？</span>
        </h1>
        <p className="mt-3 text-sm font-bold">片足立ち・プランク・前屈・スクワットで、スマホで約3分・無料</p>
      </section>

      <div className="space-y-5 px-5 py-6">
        <div className="rounded-[2rem] border-2 border-sun-400 bg-sun-100 p-5 text-navy-900">
          <p className="text-lg font-black">🎁 {siteConfig.benefit.title}</p>
          <p className="mt-1 text-[15px] font-bold leading-relaxed">{siteConfig.benefit.text}</p>
          {siteConfig.benefit.note && <p className="mt-1 text-xs text-slate-700">{siteConfig.benefit.note}</p>}
        </div>

        {gate === "checking" && <Spinner label="LINEを確認しています…" />}

        {gate === "ok" && (
          <div className="space-y-3">
            <p className="rounded-2xl bg-brand-50 p-3 text-center text-sm font-bold text-brand-800">✅ LINEの友だち追加を確認しました</p>
            <button type="button" className={buttonStyles.primary} onClick={start}>
              ▶ チェックを始める
            </button>
          </div>
        )}

        {gate === "need_friend" && (
          <div className="space-y-3">
            <p className="text-center text-base font-black">はじめに、LINEで友だち追加をお願いします</p>
            <a href={siteConfig.lineAddFriendUrl} target="_blank" rel="noopener noreferrer" className={cx(buttonStyles.primary, "!bg-[#06C755]")}>
              ① LINEで友だち追加する
            </a>
            <button type="button" className={buttonStyles.secondary} onClick={() => void checkFriend()}>
              ② 追加したので確認する
            </button>
            {msg && <p className="text-center text-sm font-bold text-red-700">{msg}</p>}
            <p className="text-center text-xs text-slate-600">友だち追加を確認できると、チェックを始められます。</p>
          </div>
        )}

        {gate === "simple" && (
          <div className="space-y-3">
            <p className="text-center text-base font-black">はじめに、LINEで友だち追加をお願いします</p>
            <a
              href={siteConfig.lineAddFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAddedClicked(true)}
              className={cx(buttonStyles.primary, "!bg-[#06C755]")}
            >
              ① LINEで友だち追加する（必須）
            </a>
            <button type="button" className={buttonStyles.accent} onClick={start} disabled={!addedClicked} aria-disabled={!addedClicked}>
              ② チェックを始める
            </button>
            {!addedClicked && <p className="text-center text-xs text-slate-600">①の友だち追加をすると、②が押せるようになります。</p>}
          </div>
        )}

        <p className="text-center text-xs leading-relaxed text-slate-600">
          LINEの友だち追加で、結果のふり返りやお得な情報をお届けします。お名前・電話番号の入力は不要です。
        </p>
      </div>
      <Footer />
    </main>
  );
}
