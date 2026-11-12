import type { Metadata } from "next";
import { BrandHeader, Footer, SectionTitle } from "@/components/ui";
import { getRepo } from "@/lib/repo";
import { getPublicCatalog } from "@/lib/services/reservations";
import { PRIVACY_VERSION } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "個人情報の取扱い" };

export default async function Privacy() {
  const catalog = await getPublicCatalog(getRepo());
  return (
    <>
      <BrandHeader small />
      <main className="mx-auto max-w-xl px-5 py-10 text-sm leading-relaxed text-ink-soft">
        <SectionTitle en="PRIVACY" ja="個人情報の取扱い" />
        <p>
          ご予約でお預かりする情報は、<strong>施術場所ごとに管理主体・利用目的・閲覧できる人が異なります</strong>。
          ある施術場所でお預かりした情報を、別の事業・別の施術場所で使うことはありません。また、予約情報を広告配信に利用することはありません。
        </p>
        <h3 className="mt-8 font-serif text-base text-ink">お預かりする情報</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>お名前・電話番号（ご本人確認とご連絡のため）</li>
          <li>ご希望の施術場所・メニュー・日時</li>
          <li>ご相談内容（任意。症状の詳しい内容はご来院時に伺いますので、必要最小限でかまいません）</li>
          <li>公式LINEのユーザー識別子（予約とLINEでのご連絡を結びつけるため）</li>
        </ul>
        <p className="mt-3">お名前・電話番号・ご相談内容・LINEのユーザー識別子は暗号化して保存します。</p>

        {catalog.map((l) => (
          <section key={l.id} className="mt-8 border-t border-line pt-6">
            <h3 className="font-serif text-base text-ink">{l.name}</h3>
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="text-xs text-mist">管理主体（個人情報の管理責任者）</dt>
                <dd>{l.controller_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-mist">利用目的</dt>
                <dd>{l.privacy_purpose}</dd>
              </div>
              <div>
                <dt className="text-xs text-mist">閲覧できる人・保管</dt>
                <dd>{l.privacy_access}</dd>
              </div>
            </dl>
            {!l.accepting && <p className="mt-2 text-xs text-mist">※ 現在この施術場所の予約受付は行っていません。</p>}
          </section>
        ))}

        <h3 className="mt-8 font-serif text-base text-ink">開示・訂正・削除</h3>
        <p className="mt-2">ご自身の情報の確認・訂正・削除をご希望の場合は、公式LINEでお申し出ください。ご本人であることを確認のうえ対応します。</p>
        <p className="mt-8 text-xs text-mist">版：{PRIVACY_VERSION}</p>
      </main>
      <Footer />
    </>
  );
}
