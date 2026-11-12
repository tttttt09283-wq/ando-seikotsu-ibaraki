import Link from "next/link";
import { BrandHeader, Footer, SectionTitle } from "@/components/ui";
import { getRepo } from "@/lib/repo";
import { getPublicCatalog } from "@/lib/services/reservations";
import { yen } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = await getPublicCatalog(getRepo());
  const anyOpen = catalog.some((l) => l.accepting);
  return (
    <>
      <BrandHeader />
      <main className="mx-auto max-w-xl px-5">
        <section className="py-14 text-center">
          <p className="font-serif text-[11px] tracking-brand text-mist">PRIVATE ACUPUNCTURE</p>
          <h1 className="mt-3 font-serif text-2xl leading-relaxed tracking-[0.16em]">
            ひとりひとりの身体に、
            <br />
            ていねいに向き合う時間を。
          </h1>
          <p className="mx-auto mt-6 max-w-sm text-sm text-ink-soft">
            鍼灸師 岩永拓己のご予約ページです。ご予約は公式LINEで受付を確認したうえで、内容を確認し、確定のご連絡をいたします。
          </p>
          <Link
            href="/reserve"
            className={`mt-8 inline-block w-full max-w-xs border px-6 py-4 text-sm tracking-[0.2em] ${anyOpen ? "border-ink bg-ink text-paper hover:bg-ink-soft" : "border-line text-mist"}`}
          >
            {anyOpen ? "予約フォームへ" : "予約フォーム（受付準備中）"}
          </Link>
        </section>

        <section className="py-6">
          <SectionTitle en="PLACE" ja="施術場所" />
          <ul className="divide-y divide-line border-y border-line">
            {catalog.map((l) => (
              <li key={l.id} className="py-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-serif tracking-[0.08em]">{l.name}</p>
                  <span className={`shrink-0 text-[11px] tracking-[0.12em] ${l.accepting ? "text-ok" : "text-mist"}`}>{l.accepting ? "受付中" : "受付準備中"}</span>
                </div>
                <p className="mt-1 text-xs text-mist">{l.public_area}</p>
                {l.services.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {l.services.map((s) => (
                      <li key={s.id} className="flex justify-between gap-3">
                        <span>{s.name}（{s.duration_minutes}分）</span>
                        <span className="tabular-nums">{yen(s.price_tax_included)}<span className="text-xs text-mist">（税込）</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="py-6">
          <SectionTitle en="FLOW" ja="ご予約の流れ" />
          <ol className="space-y-4 text-sm text-ink-soft">
            {[
              ["フォームに入力", "施術場所・メニュー・ご希望の日時を選びます。この時点では仮予約です。"],
              ["公式LINEで送信", "表示される内容を公式LINEでそのまま送信してください。送信の確認ができると「LINE受付確認済み」になります。"],
              ["確定のご連絡", "内容を確認し、公式LINEで予約確定のご連絡をいたします。確定のご連絡をもってご予約完了です。"],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="font-serif text-xl text-mist">{i + 1}</span>
                <div>
                  <p className="font-medium text-ink">{t}</p>
                  <p>{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </>
  );
}
