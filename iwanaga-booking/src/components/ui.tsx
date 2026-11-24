import Link from "next/link";

export function BrandHeader({ small = false }: { small?: boolean }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">
        <Link href="/" className="block">
          <span className="font-serif text-[11px] tracking-brand text-mist">ACUPUNCTURE</span>
          <span className={`block font-serif ${small ? "text-base" : "text-lg"} tracking-[0.18em]`}>岩永拓己 鍼灸</span>
        </Link>
        <Link href="/reserve" className="border border-ink px-4 py-2 text-xs tracking-[0.2em] hover:bg-ink hover:text-paper">
          ご予約
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-stone">
      <div className="mx-auto max-w-xl space-y-3 px-5 py-8 text-xs text-mist">
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy" className="underline-offset-4 hover:underline">個人情報の取扱い</Link>
          <Link href="/cancel-policy" className="underline-offset-4 hover:underline">キャンセル規定</Link>
          <Link href="/reserve" className="underline-offset-4 hover:underline">ご予約</Link>
        </nav>
        <p>ご予約・お問い合わせの窓口は、岩永拓己の公式LINEのみです。</p>
        <p className="font-serif tracking-[0.18em]">© 岩永拓己 鍼灸</p>
      </div>
    </footer>
  );
}

export function SectionTitle({ en, ja }: { en: string; ja: string }) {
  return (
    <div className="mb-4">
      <p className="font-serif text-[10px] tracking-brand text-mist">{en}</p>
      <h2 className="font-serif text-lg tracking-[0.12em]">{ja}</h2>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "ng" | "ok"; children: React.ReactNode }) {
  const cls = {
    info: "border-line bg-stone text-ink-soft",
    warn: "border-[#e6d3b0] bg-[#fbf6ec] text-warn",
    ng: "border-[#e4c3c3] bg-[#fbf1f1] text-ng",
    ok: "border-[#c5d8cc] bg-[#f1f7f3] text-ok",
  }[tone];
  return <div className={`border px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
}
