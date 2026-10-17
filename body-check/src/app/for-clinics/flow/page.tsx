import type { Metadata } from "next";
import Link from "next/link";
import { FunnelCalc } from "@/components/sales/FunnelCalc";

export const metadata: Metadata = { title: "活用手順（集客〜成約まで）｜あんど式 カラダ年齢チェック" };

const STEPS = [
  {
    icon: "📣",
    title: "知ってもらう（集客）",
    who: "院長・SNS担当",
    doThis: [
      "LINEリッチメニューに「カラダ年齢チェック」を設置する",
      "Instagram・LINE配信・Googleビジネスプロフィールで「3分で分かる」と案内する",
      "店頭・受付・待合にPOPとQRコードを置く",
    ],
    tool: { href: "/for-clinics/sns", label: "SNS投稿文" },
    kpi: "チェック実施数",
  },
  {
    icon: "📱",
    title: "チェックしてもらう",
    who: "利用者（スタッフが声かけ）",
    doThis: [
      "受付・待ち時間に「3分でできるので、よかったら」と声をかける",
      "家族・友人への紹介にも使ってもらう（「ご家族もぜひ」）",
      "イベント・体験会では、スタッフがその場で一緒にチェックする",
    ],
    tool: { href: "/for-clinics/templates", label: "受付トーク・卓上カード" },
    kpi: "チェック完了数",
  },
  {
    icon: "📊",
    title: "結果で“自分ごと”にする",
    who: "利用者",
    doThis: [
      "カラダ年齢・ランク・レーダーチャートで、今の状態を見える化",
      "結果に合わせて「専門スタッフが確認したいこと」が表示される",
      "セルフケアの提案で、予約しない方にも役立つ体験に",
    ],
    tool: { href: "/demo", label: "デモで結果画面を見る" },
    kpi: "結果画面の表示数",
  },
  {
    icon: "📅",
    title: "予約につなげる",
    who: "利用者 → 院",
    doThis: [
      "結果画面の「この内容で相談・予約する」から、そのままWEB予約",
      "チェック結果（カラダ年齢・スコア）が予約フォームに引き継がれる",
      "特典（例：結果画面のご提示で初回検査無料）を用意すると、予約率が上がりやすい",
    ],
    tool: { href: "/for-clinics/guide", label: "予約連携の設定" },
    kpi: "予約数・予約率",
  },
  {
    icon: "🤝",
    title: "来院時に結果を活かす",
    who: "受付・施術者",
    doThis: [
      "予約に付いた結果の要約を見て、来院前に確認ポイントを準備する",
      "初回カウンセリングでは、結果画面を一緒に見ながら話を聞く",
      "「スコアが低かった項目」を実際の検査で詳しく確認する",
    ],
    tool: { href: "/for-clinics/templates", label: "結果説明トーク" },
    kpi: "来院数・来院率",
  },
  {
    icon: "🎯",
    title: "継続・成約につなげる",
    who: "施術者",
    doThis: [
      "検査結果をもとに、改善の目標と通院のペースを一緒に決める",
      "回数券・定期プランなどを、目標に合わせて提案する",
      "「1か月後にもう一度チェックして変化を見ましょう」と次回の約束をする",
    ],
    tool: { href: "/for-clinics/templates", label: "提案・フォローのテンプレート" },
    kpi: "継続率・成約数",
  },
  {
    icon: "🔁",
    title: "再チェックで変化を見せる",
    who: "受付・LINE担当",
    doThis: [
      "1か月後・3か月後に「もう一度チェック」をLINEで案内する",
      "前回との変化を一緒に確認し、モチベーションを保つ",
      "変化を実感した方に、口コミ・ご紹介をお願いする",
    ],
    tool: { href: "/for-clinics/sns", label: "再チェック案内のLINE文例" },
    kpi: "再来院・紹介数",
  },
];

export default function FlowPage() {
  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs font-bold tracking-widest text-brand-600">HOW TO USE</p>
        <h1 className="mt-1 text-3xl font-black text-navy-900">集客から成約までの活用手順</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
          カラダ年齢チェックは「置くだけ」では成果が出にくいツールです。下の7つのステップで、知ってもらう→チェック→予約→来院→継続までを、院の流れの中に組み込みましょう。各ステップで使うテンプレートも用意しています。
        </p>
      </header>

      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid gap-4 rounded-3xl bg-white p-5 sm:grid-cols-[180px_1fr_200px]">
            <div>
              <span className="text-xs font-black text-brand-500">STEP {i + 1}</span>
              <p className="mt-1 text-2xl" aria-hidden="true">{s.icon}</p>
              <p className="mt-1 text-lg font-black leading-snug text-navy-900">{s.title}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">担当：{s.who}</p>
            </div>
            <ul className="space-y-2">
              {s.doThis.map((d) => (
                <li key={d} className="flex gap-2 text-sm leading-relaxed text-navy-900">
                  <span className="font-black text-brand-600" aria-hidden="true">●</span>
                  {d}
                </li>
              ))}
            </ul>
            <div className="space-y-2 rounded-2xl bg-brand-50 p-3 text-sm">
              <p className="text-xs font-bold text-slate-600">使うもの</p>
              <Link href={s.tool.href} className="font-black text-brand-700 underline underline-offset-4">
                {s.tool.label} →
              </Link>
              <p className="pt-1 text-xs font-bold text-slate-600">見る数字</p>
              <p className="font-black text-navy-900">{s.kpi}</p>
            </div>
          </li>
        ))}
      </ol>

      <section>
        <h2 className="text-2xl font-black text-navy-900">🧮 月の見込みを計算してみる</h2>
        <p className="mt-2 text-sm text-slate-700">チェック数と各段階の割合を入れると、予約・来院・成約・売上の目安が出ます。</p>
        <div className="mt-4">
          <FunnelCalc />
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5">
        <h2 className="text-lg font-black text-navy-900">✅ 成果につなげる3つのコツ</h2>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-navy-900">
          <li>
            <b>1. 毎日の声かけを“型”にする</b>：受付で全員に同じ一言（受付トーク）を使うと、チェック数が安定します。
          </li>
          <li>
            <b>2. 結果を来院時に必ず使う</b>：「チェックの結果を見てきました」と最初に伝えるだけで、信頼感が大きく変わります。
          </li>
          <li>
            <b>3. 数字を月1回だけ見る</b>：チェック数・予約数・来院数を毎月記録し、一番低い段階だけを改善します。
          </li>
        </ol>
      </section>
    </div>
  );
}
