import Link from "next/link";
import { siteConfig } from "@/config/site";
import { HeroIllustration } from "@/components/Illustrations";
import { Footer, MedicalDisclaimer } from "@/components/ui";
import { ResumeLinks } from "@/components/StartButtons";

/** メニュー（色は薄い背景・濃い文字・枠の3つでチェックごとに分ける） */
const MENU = [
  { href: "/check", icon: "🧍", title: "カラダ年齢", time: "約3分", text: "5つの簡単な動きで、カラダが何歳レベルか分かる", badge: "いちばん人気", color: "#0b6d76", bg: "#e6f7f8", border: "#a3e1e7" },
  { href: "/posture", icon: "📸", title: "AI姿勢", time: "約2分", text: "写真からAIが猫背・反り腰・傾きを見つける", color: "#1d4ed8", bg: "#eef4ff", border: "#bfd3fb" },
  { href: "/skeleton", icon: "🧬", title: "骨格タイプ", time: "約2分", text: "10の質問で、骨格タイプとケアのポイントが分かる", color: "#7e22ce", bg: "#f6efff", border: "#dcc6f7" },
  { href: "/core", icon: "💪", title: "体幹", time: "約5分", text: "4つのテストで、体を支える力と左右差をチェック", color: "#c2410c", bg: "#fff3e8", border: "#fbd0ab" },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* ヘッダー部分 */}
      <section className="relative overflow-hidden rounded-b-[2.5rem] bg-gradient-to-b from-brand-500 to-brand-600 px-5 pb-10 pt-6 text-white">
        <div aria-hidden="true" className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
        <div aria-hidden="true" className="absolute -left-8 top-40 size-24 rounded-full bg-white/10" />

        <p className="relative text-center text-sm font-bold tracking-wider">
          <span className="rounded-full bg-white/20 px-3 py-1">LINE友だち限定</span>
        </p>
        <p className="relative mt-3 text-center text-base font-bold">{siteConfig.serviceName}</p>
        <h1 className="relative mt-2 text-center text-[2rem] font-black leading-tight">
          あなたのカラダ、
          <br />
          <span className="text-sun-300">何歳レベル？</span>
        </h1>

        <HeroIllustration className="relative mx-auto mt-4 w-64" />

        <p className="relative mt-2 text-center text-xl font-bold leading-snug">
          おうちでできる
          <br />
          <span className="text-sun-300">4つ</span>の無料カラダチェック
        </p>
      </section>

      <div className="-mt-6 space-y-5 px-5">
        <p className="relative text-center text-sm font-black text-white">▼ 気になるチェックを選んでください（すべて無料）</p>

        <ResumeLinks />

        {/* 4つのチェック（2列・色分け） */}
        <ul className="grid grid-cols-2 gap-3">
          {MENU.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className="relative flex h-full flex-col rounded-3xl border-2 p-3 shadow-[0_4px_14px_rgba(30,58,95,0.08)] transition active:scale-[0.98]"
                style={{ background: m.bg, borderColor: m.border }}
              >
                {m.badge && (
                  <span className="absolute -top-2 left-3 rounded-full bg-sun-300 px-2 py-0.5 text-[10px] font-black text-navy-900">{m.badge}</span>
                )}
                <span className="flex size-14 items-center justify-center self-center rounded-2xl bg-white text-4xl shadow-sm" aria-hidden="true">
                  {m.icon}
                </span>
                <span className="mt-2 text-center text-base font-black leading-tight" style={{ color: m.color }}>
                  <span className="block">{m.title}</span>
                  <span className="block">チェック</span>
                </span>
                <span className="mt-0.5 text-center text-[11px] font-bold text-slate-500">{m.time}</span>
                <span className="mt-1.5 flex-1 text-xs leading-snug text-navy-900">{m.text}</span>
                <span className="mt-2 rounded-full py-1.5 text-center text-sm font-black text-white" style={{ background: m.color }}>
                  はじめる ›
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <ul className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-navy-700">
          <li className="rounded-2xl bg-white p-3">
            <span className="block text-2xl" aria-hidden="true">⏱️</span>1つ2〜5分
          </li>
          <li className="rounded-2xl bg-white p-3">
            <span className="block text-2xl" aria-hidden="true">🙆</span>登録・ログイン不要
          </li>
          <li className="rounded-2xl bg-white p-3">
            <span className="block text-2xl" aria-hidden="true">🔒</span>結果はスマホ内で計算
          </li>
        </ul>

        <MedicalDisclaimer />
      </div>

      <Footer />
    </main>
  );
}
