import Link from "next/link";
import { CHECK_META, CHECK_ORDER } from "@/config/checks";
import { siteConfig } from "@/config/site";
import { CheckIllustration, HeroIllustration } from "@/components/Illustrations";
import { Card, Footer, MedicalDisclaimer } from "@/components/ui";
import { StartButtons } from "@/components/StartButtons";

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

        {/* ① カラダ年齢チェック（いちばんのおすすめ） */}
        <Card className="relative animate-rise-in">
          <p className="inline-block rounded-full bg-sun-300 px-3 py-0.5 text-xs font-black text-navy-900">いちばん人気</p>
          <h2 className="mt-2 text-xl font-black">🧍 カラダ年齢チェック</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">5つの簡単なチェックで、あなたのカラダが何歳レベルかを見える化します（約3分）。</p>
          <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="チェックする5つの項目">
            {CHECK_ORDER.map((id) => (
              <li key={id} className="flex flex-col items-center gap-1">
                <CheckIllustration id={id} className="size-12" />
                <span className="text-[11px] font-bold leading-tight text-navy-700">{CHECK_META[id].shortName}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <StartButtons />
          </div>
        </Card>

        {/* ②〜④ ほかのチェック */}
        <ul className="space-y-3">
          {[
            { href: "/posture", icon: "📸", title: "AI姿勢チェック", time: "約2分", text: "横向き・正面の写真から、AIが猫背・反り腰・左右の傾きなどの姿勢のクセを見つけます。" },
            { href: "/skeleton", icon: "🧬", title: "骨格タイプチェック", time: "約2分", text: "10の質問で、ストレート／ウェーブ／ナチュラルのどのタイプかと、体のケアのポイントが分かります。" },
            { href: "/core", icon: "💪", title: "体幹チェック", time: "約5分", text: "プランクなど4つのテストで、体を支える力と左右差をチェック。おすすめのセルフケア付き。" },
          ].map((m) => (
            <li key={m.href}>
              <Link href={m.href} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgba(30,58,95,0.08)] active:bg-brand-50">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-3xl" aria-hidden="true">
                  {m.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-lg font-black text-navy-900">
                    {m.title}
                    <span className="ml-2 text-xs font-bold text-brand-600">{m.time}</span>
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-slate-700">{m.text}</span>
                </span>
                <span className="text-2xl text-brand-600" aria-hidden="true">
                  ›
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
