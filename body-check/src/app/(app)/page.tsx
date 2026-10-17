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
          たった<span className="mx-1 text-3xl text-sun-300">3</span>分！
          <br />
          おうちでできる無料カラダチェック
        </p>
      </section>

      <div className="-mt-6 space-y-5 px-5">
        <Card className="relative animate-rise-in text-center">
          <p className="text-lg font-bold leading-relaxed">
            5つの簡単なチェックで、
            <br />
            あなたの身体のコンディションを
            <br />
            <span className="bg-[linear-gradient(transparent_60%,var(--color-sun-300)_60%)]">見える化！</span>
          </p>
          <ol className="mt-4 grid grid-cols-5 gap-1" aria-label="チェックする5つの項目">
            {CHECK_ORDER.map((id) => (
              <li key={id} className="flex flex-col items-center gap-1">
                <CheckIllustration id={id} className="size-14" />
                <span className="text-[11px] font-bold leading-tight text-navy-700">{CHECK_META[id].shortName}</span>
              </li>
            ))}
          </ol>
        </Card>

        <StartButtons />

        <ul className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-navy-700">
          <li className="rounded-2xl bg-white p-3">
            <span className="block text-2xl" aria-hidden="true">⏱️</span>約3分
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
