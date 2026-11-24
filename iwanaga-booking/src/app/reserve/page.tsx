import type { Metadata } from "next";
import { BrandHeader, Footer } from "@/components/ui";
import { getRepo } from "@/lib/repo";
import { getPublicCatalog } from "@/lib/services/reservations";
import { config } from "@/lib/config";
import ReserveForm from "./ReserveForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ご予約" };

export default async function ReservePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const src = typeof sp.src === "string" && /^[a-z0-9_-]{1,32}$/.test(sp.src) ? sp.src : null;
  const catalog = await getPublicCatalog(getRepo());
  return (
    <>
      <BrandHeader small />
      <main className="mx-auto max-w-xl px-5 py-8">
        <p className="font-serif text-[10px] tracking-brand text-mist">RESERVATION</p>
        <h1 className="font-serif text-xl tracking-[0.14em]">ご予約フォーム</h1>
        <p className="mt-3 text-sm text-ink-soft">
          フォームの送信は<strong>仮予約</strong>です。公式LINEでの送信と、内容の確認後に予約確定のご連絡をいたします。
        </p>
        <div className="mt-8">
          <ReserveForm catalog={catalog} source={src} liffId={config.liffId ?? null} />
        </div>
      </main>
      <Footer />
    </>
  );
}
