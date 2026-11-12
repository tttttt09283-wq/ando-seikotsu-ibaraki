import type { Metadata } from "next";
import { BrandHeader, Footer, SectionTitle } from "@/components/ui";
import { getRepo } from "@/lib/repo";
import { getPublicCatalog } from "@/lib/services/reservations";
import { CANCEL_POLICY_VERSION } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "キャンセル規定" };

export default async function CancelPolicy() {
  const catalog = await getPublicCatalog(getRepo());
  return (
    <>
      <BrandHeader small />
      <main className="mx-auto max-w-xl px-5 py-10 text-sm leading-relaxed text-ink-soft">
        <SectionTitle en="CANCELLATION" ja="キャンセル規定" />
        <p>ご予約の変更・キャンセルは、公式LINEのトークでご連絡ください。施術場所ごとの規定は次のとおりです。</p>
        {catalog.map((l) => (
          <section key={l.id} className="mt-6 border-t border-line pt-5">
            <h3 className="font-serif text-base text-ink">{l.name}</h3>
            <p className="mt-2 whitespace-pre-wrap">{l.cancel_policy || "受付開始時に掲載します。"}</p>
          </section>
        ))}
        <p className="mt-8 text-xs text-mist">版：{CANCEL_POLICY_VERSION}</p>
      </main>
      <Footer />
    </>
  );
}
