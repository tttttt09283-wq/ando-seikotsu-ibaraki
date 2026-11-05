import type { Metadata } from "next";
import Link from "next/link";
import { Checklist } from "@/components/sales/Checklist";

export const metadata: Metadata = { title: "導入ガイド｜あんど式 カラダ年齢チェック" };

const PREPARE = [
  { t: "院名（正式名称）", d: "チェック画面・結果画面の「運営」に表示されます。" },
  { t: "予約ページのURL", d: "結果画面の予約ボタンの行き先です（https:// から始まるURL）。予約システムがない場合は、LINE公式アカウントのトークURLでも運用できます。" },
  { t: "LINE公式アカウント", d: "リッチメニューにリンクを設置するために使います（管理者権限のあるアカウント）。" },
  { t: "（任意）ロゴ・院の写真", d: "カスタマイズをご希望の場合にご用意ください。" },
  { t: "（任意）特典の内容", d: "例：「結果画面のご提示で初回の身体チェック無料」。予約のきっかけになります。" },
];

const SETUP = [
  {
    t: "専用ページのURLを受け取る",
    body: [
      "院情報をご提出いただくと、貴院専用のチェックページURLをお送りします。",
      "まずはスマホで開き、最初から結果画面まで一通り試してください。",
      "結果画面の予約ボタンを押して、貴院の予約ページが開くことを確認します。",
    ],
  },
  {
    t: "LINEリッチメニューに設置する",
    body: [
      "LINE Official Account Manager にログインし、「リッチメニュー」を開きます。",
      "使っていない枠（または新しいリッチメニュー）を選び、アクションを「リンク」にします。",
      "受け取ったチェックページのURLを貼り付け、ボタンの名前を「カラダ年齢チェック」などにして保存します。",
      "スマホのLINEで実際にタップし、チェックページが開くことを確認します。",
    ],
  },
  {
    t: "予約との連携を確認する",
    body: [
      "結果画面の予約ボタンは、予約ページのURLに結果の要約を付けて開きます（例：?src=body-check&bc=姿勢・体幹年齢52歳…）。",
      "予約システムがこの情報を読み取れる場合は、予約データ・通知に「カラダチェック経由」の目印と結果の要約が残ります。",
      "読み取れない予約システムの場合でも、予約ボタンはそのまま使えます（結果は利用者のスマホの画面でご確認ください）。",
    ],
  },
  {
    t: "店頭・受付に案内を置く",
    body: [
      "「店頭テンプレート」から、A4ポスターと卓上カードを印刷します（QRコードは自動で入ります）。",
      "受付カウンター・待合・施術ベッドの近くなど、待ち時間に目に入る場所に置きます。",
    ],
    link: { href: "/for-clinics/templates", label: "店頭テンプレートを開く" },
  },
  {
    t: "スタッフに共有する",
    body: [
      "デモを全員で一度ずつ体験し、4つのチェックの内容を知っておきます。",
      "受付トーク（声かけの一言）と、結果説明トークを全員で読み合わせます。",
      "「カラダチェック経由」の予約が入ったときの対応（来院前に結果の要約を確認する）を決めておきます。",
    ],
    link: { href: "/for-clinics/flow", label: "活用手順を見る" },
  },
  {
    t: "SNS・LINEで告知する",
    body: [
      "「SNS投稿文」から、LINE配信・Instagram・Googleビジネスプロフィール用の文章をコピーして投稿します。",
      "最初の1か月は、週1回を目安に案内を続けると、チェック数が安定しやすくなります。",
    ],
    link: { href: "/for-clinics/sns", label: "SNS投稿文を開く" },
  },
];

const CHECKLIST = [
  "専用ページを自分のスマホで最初から最後まで試した",
  "結果画面の予約ボタンで、自院の予約ページが開くことを確認した",
  "LINEリッチメニューにリンクを設置し、実際にタップして確認した",
  "A4ポスター・卓上カードを印刷して設置した",
  "スタッフ全員がデモを体験し、受付トークを読み合わせた",
  "「カラダチェック経由」の予約が入ったときの対応を決めた",
  "LINE配信・SNSで最初の告知をした",
  "毎月見る数字（チェック数・予約数・来院数）と記録する人を決めた",
];

const RULES = [
  "本チェックは医療診断ではありません。案内・投稿では「診断」「治る」「必ず改善」などの表現は使わず、「チェック」「目安」「状態を知る」といった表現を使ってください。",
  "チェック中に痛み・めまいなどが出た場合は中止するよう、画面でも案内しています。店頭で一緒に行う場合も、無理をさせないでください。",
  "施術の効果・体験談を広告に使う場合は、柔道整復・あはき（はり・きゅう）の広告に関するルールをご確認ください。",
];

export default function GuidePage() {
  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs font-bold tracking-widest text-brand-600">SETUP GUIDE</p>
        <h1 className="mt-1 text-3xl font-black text-navy-900">導入ガイド</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
          専用ページのURLを受け取ってから、運用を始めるまでの手順です。早ければ1日で準備できます。
        </p>
      </header>

      <section>
        <h2 className="text-xl font-black text-navy-900">📝 ご用意いただくもの</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PREPARE.map((p) => (
            <li key={p.t} className="rounded-2xl bg-white p-4">
              <p className="font-black text-navy-900">{p.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{p.d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-navy-900">🛠️ 設定の手順</h2>
        <ol className="mt-4 space-y-4">
          {SETUP.map((s, i) => (
            <li key={s.t} className="rounded-3xl bg-white p-5">
              <p className="flex items-center gap-2 text-lg font-black text-navy-900">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm text-white">{i + 1}</span>
                {s.t}
              </p>
              <ul className="mt-3 space-y-1.5 pl-10">
                {s.body.map((b) => (
                  <li key={b} className="list-disc text-sm leading-relaxed text-navy-900">
                    {b}
                  </li>
                ))}
              </ul>
              {s.link && (
                <p className="mt-3 pl-10">
                  <Link href={s.link.href} className="text-sm font-bold text-brand-700 underline underline-offset-4">
                    {s.link.label} →
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-black text-navy-900">✅ 運用開始前のチェックリスト</h2>
        <p className="mt-1 text-xs text-slate-600">チェックした内容はこのブラウザに保存されます。</p>
        <div className="mt-4">
          <Checklist items={CHECKLIST} />
        </div>
      </section>

      <section className="rounded-3xl border-2 border-sun-400 bg-sun-100 p-5">
        <h2 className="text-lg font-black text-navy-900">⚠️ ご利用にあたっての注意</h2>
        <ul className="mt-3 space-y-2">
          {RULES.map((r) => (
            <li key={r} className="text-sm leading-relaxed text-navy-900">
              ・{r}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
