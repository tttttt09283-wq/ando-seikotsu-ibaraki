"use client";

/** デモモード中だけ、画面の上に「デモ版」の帯を出す（導入検討中の院が試すとき用） */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setDemo } from "@/lib/demo";
import { useIsDemo } from "@/lib/useDemo";

export function DemoBanner() {
  const demo = useIsDemo();
  const router = useRouter();
  if (!demo) return null;
  const end = () => {
    setDemo(false);
    router.push("/for-clinics");
  };
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center gap-2 bg-navy-900 px-4 py-2 text-xs font-bold text-white">
      <span className="rounded-full bg-sun-400 px-2 py-0.5 text-navy-900">デモ版</span>
      <span className="flex-1 leading-snug">お試し中です。結果はどこにも送信されません。</span>
      <Link href="/for-clinics" className="underline underline-offset-2">導入について</Link>
      <button type="button" onClick={end} className="rounded-full border border-white/40 px-2 py-0.5">
        終了
      </button>
    </div>
  );
}
