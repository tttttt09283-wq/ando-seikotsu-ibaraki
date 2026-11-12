import type { Metadata } from "next";
import { BrandHeader, Footer } from "@/components/ui";
import StatusView from "./StatusView";

export const metadata: Metadata = { title: "予約状況", robots: { index: false, follow: false } };

export default async function StatusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const code = typeof sp.c === "string" ? sp.c : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  return (
    <>
      <BrandHeader small />
      <main className="mx-auto max-w-xl px-5 py-8">
        <p className="font-serif text-[10px] tracking-brand text-mist">STATUS</p>
        <h1 className="mb-6 font-serif text-xl tracking-[0.14em]">予約状況</h1>
        <StatusView code={code} token={token} />
      </main>
      <Footer />
    </>
  );
}
