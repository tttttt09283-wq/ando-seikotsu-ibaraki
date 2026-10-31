import Link from "next/link";
import { salesConfig } from "@/config/sales";
import { QrImage } from "@/components/sales/Personalize";
import { buttonStyles, cx } from "@/components/styles";

const MENUS = [
  { icon: "🧍", title: "カラダ年齢チェック", time: "約3分", text: "片足立ち・プランク・前屈・スクワットの4項目で「姿勢・体幹年齢 〇〇歳」を判定。項目ごとの年齢・スコア・レーダーチャート付き。" },
  { icon: "📸", title: "AI姿勢チェック", time: "約2分", text: "横向き・正面の写真をAIが解析。猫背・反り腰・肩や骨盤の傾きを点数と所見で表示します。" },
  { icon: "🧬", title: "骨格タイプチェック", time: "約2分", text: "10の質問でストレート／ウェーブ／ナチュラルを判定。美容・ボディメイク系の集客にも。" },
  { icon: "💪", title: "体幹チェック", time: "約5分", text: "プランク・サイドプランクなど4つのテストで、体を支える力と左右差を点数化。セルフケア付き。" },
];

const PAINS = [
  { icon: "🚪", title: "初めての方の来院ハードルが高い", text: "「整骨院に行くほどかな？」と迷っている方が、予約の一歩を踏み出せない。" },
  { icon: "📣", title: "LINE・SNSで発信する“ネタ”がない", text: "友だちは増えても、お知らせ以外に送る内容がなく、反応が薄い。" },
  { icon: "🗣️", title: "初回の説明に時間がかかる", text: "来院されてから一から状態を聞き取るので、提案までに時間がかかる。" },
];

const FLOW = [
  { icon: "📱", title: "LINE・QRから開く", text: "リッチメニューや店頭のQRコードから、登録・ログインなしですぐに始められます。" },
  { icon: "🧍", title: "選べるセルフチェック", text: "カラダ年齢・AI姿勢・骨格タイプ・体幹の4メニューから、気になるものを選んで2〜5分。" },
  { icon: "📊", title: "結果で見える化", text: "姿勢・体幹年齢・姿勢の点数・骨格タイプ・体幹スコアなど、今の身体の状態を分かりやすく表示。" },
  { icon: "📅", title: "結果を持ってWEB予約", text: "気になる点と結果が予約フォームに引き継がれ、院は来院前に「何を見てほしいか」が分かります。" },
];

const FEATURES = [
  { icon: "⏱️", title: "約3分・登録不要", text: "名前やメールアドレスは聞きません。気軽に試せるので、新しい方との最初の接点に。" },
  { icon: "🎯", title: "年齢で“自分ごと化”", text: "4つの記録を年齢ごとの目安と比べて「〇〇歳」で表示。実年齢との差がひと目で分かります。" },
  { icon: "🤝", title: "結果から相談・予約へ", text: "結果に合わせて「専門スタッフが詳しく確認したいこと」を表示し、自然に予約へつなげます。" },
  { icon: "🧘", title: "セルフケア付き", text: "結果に合わせたセルフケアを最大3つ提案。予約しない方にも価値を届けます。" },
  { icon: "🛡️", title: "安全への配慮", text: "チェック前の安全確認、痛みがある場合の中止案内、医療診断ではない旨の表示を標準で搭載。" },
  { icon: "🔒", title: "個人情報を持たない", text: "採点は利用者のスマホの中だけで行います。院側で個人情報を管理する負担がありません。" },
];

const STEPS = [
  { title: "お問い合わせ・デモ", text: "デモを試していただき、オンラインまたはお電話でご説明します。" },
  { title: "お申し込み・院情報のご提出", text: "院名・予約ページのURL・ロゴ（任意）などをお知らせください。" },
  { title: "貴院専用ページの発行", text: "院名と予約URLを設定した、貴院専用のチェックページURLをお渡しします。" },
  { title: "LINE・店頭の準備", text: "導入ガイドに沿って、リッチメニュー設定・POP掲示・スタッフ共有をします。" },
  { title: "運用スタート", text: "SNS投稿文・店頭テンプレートを使って案内を始めます。" },
];

const FAQ = [
  { q: "医療機器や診断ツールですか？", a: "いいえ。運動の回数や自己申告をもとにした独自の参考指標で、医療診断ではありません。画面にもその旨を表示しています。" },
  { q: "患者様の個人情報は保存されますか？", a: "チェックでは氏名・電話番号・メールアドレスを取得しません。採点は利用者のスマホの中で行います。予約フォームに進んだ場合のみ、貴院の予約システムに結果の要約が引き継がれます。" },
  { q: "今使っている予約システムと連携できますか？", a: "予約ボタンの行き先は、貴院の予約ページのURL（https://〜）に設定できます。結果の自動引き継ぎ（予約フォームへの入力）は予約システムによって対応範囲が異なるため、ご相談ください。" },
  { q: "院名やデザインは変えられますか？", a: "院名・予約URLの設定は標準で対応しています。ロゴ・色・チェック内容のカスタマイズはご相談ください。" },
  { q: "スマホが苦手な高齢の方でも使えますか？", a: "大きな文字・大きなボタンで、1画面に1つの操作にしています。店頭ではスタッフが一緒に操作する使い方もおすすめです。" },
  { q: "導入までどのくらいかかりますか？", a: "院情報をいただいてから、専用ページの発行まで通常数日程度です。" },
];

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <p className="text-xs font-bold tracking-widest text-brand-600">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black leading-snug text-navy-900 sm:text-3xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ContactBlock() {
  const { contactUrl, contactEmail } = salesConfig;
  if (!contactUrl && !contactEmail) {
    return (
      <p className="rounded-2xl bg-white p-4 text-center text-sm font-bold text-slate-600">
        お問い合わせ窓口は現在準備中です。
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {contactUrl && (
        <a href={contactUrl} target="_blank" rel="noopener noreferrer" className={buttonStyles.accent}>
          導入について問い合わせる
        </a>
      )}
      {contactEmail && (
        <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`${salesConfig.productName}の導入について`)}`} className={buttonStyles.secondary}>
          メールで問い合わせる
        </a>
      )}
    </div>
  );
}

export default function ForClinicsPage() {
  const demoUrl = `${salesConfig.appUrl.replace(/\/$/, "")}/demo`;
  const { pricing } = salesConfig;
  return (
    <div className="space-y-14 sm:space-y-20">
      {/* ===== ファーストビュー ===== */}
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white shadow-[0_10px_30px_rgba(14,136,147,0.3)] sm:p-10">
        <div className="grid items-center gap-8 sm:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold">整骨院・治療院向け 集客ツール</p>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
              「あなたの姿勢・体幹は
              <br />
              <span className="text-sun-300">何歳？</span>」
            </h1>
            <p className="mt-4 text-base font-bold leading-relaxed sm:text-lg">
              LINEから選べる4つのセルフ身体チェックで、
              <br className="hidden sm:block" />
              “気になる”を“予約”に変える。
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className={cx(buttonStyles.accent, "sm:w-auto")}>
                📱 デモを試してみる（無料）
              </Link>
              <a href="#contact" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-white px-6 font-bold">
                導入の相談をする
              </a>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-5 text-center text-navy-900">
            <p className="text-sm font-black">スマホで今すぐ体験</p>
            <QrImage value={demoUrl} size={150} className="mx-auto mt-3" />
            <p className="mt-2 text-xs text-slate-600">QRコードを読み取るとデモが始まります。結果はどこにも送信されません。</p>
            <ul className="mt-4 grid grid-cols-4 gap-1">
              {MENUS.map((m) => (
                <li key={m.title} className="flex flex-col items-center gap-1">
                  <span className="text-2xl" aria-hidden="true">{m.icon}</span>
                  <span className="text-[10px] font-bold leading-tight">{m.title.replace("チェック", "")}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Section eyebrow="PROBLEM" title="こんなお悩みはありませんか？">
        <ul className="grid gap-4 sm:grid-cols-3">
          {PAINS.map((p) => (
            <li key={p.title} className="rounded-3xl bg-white p-5">
              <p className="text-3xl" aria-hidden="true">{p.icon}</p>
              <p className="mt-2 font-black text-navy-900">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{p.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="MENU" title="4つのチェックから選べます">
        <ul className="grid gap-4 sm:grid-cols-2">
          {MENUS.map((m) => (
            <li key={m.title} className="flex gap-4 rounded-3xl bg-white p-5">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-3xl" aria-hidden="true">
                {m.icon}
              </span>
              <div>
                <p className="font-black text-navy-900">
                  {m.title}
                  <span className="ml-2 text-xs font-bold text-brand-600">{m.time}</span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{m.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-700">どのチェックも、結果画面からそのまま貴院のWEB予約へ。結果の要約は予約フォームに引き継がれます。</p>
      </Section>

      <Section eyebrow="HOW IT WORKS" title="チェックから予約まで、ひとつの流れに">
        <ol className="grid gap-4 sm:grid-cols-4">
          {FLOW.map((f, i) => (
            <li key={f.title} className="relative rounded-3xl bg-white p-5">
              <span className="absolute right-4 top-4 text-xs font-black text-brand-300">STEP {i + 1}</span>
              <p className="text-3xl" aria-hidden="true">{f.icon}</p>
              <p className="mt-2 font-black text-navy-900">{f.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{f.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          <Link href="/for-clinics/flow" className="font-bold text-brand-700 underline underline-offset-4">
            🗺️ 集客〜来院〜成約までの具体的な活用手順を見る →
          </Link>
        </p>
      </Section>

      <Section eyebrow="FEATURES" title="選ばれる理由">
        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-3xl bg-white p-5">
              <p className="text-2xl" aria-hidden="true">{f.icon}</p>
              <p className="mt-2 font-black text-navy-900">{f.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{f.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="PRICE" title="料金と含まれるもの">
        <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
          <div className="rounded-3xl bg-white p-6">
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-bold text-slate-600">初期費用</dt>
                <dd className="text-2xl font-black text-navy-900">{pricing.initialFee ?? "お問い合わせください"}</dd>
              </div>
              <div>
                <dt className="text-sm font-bold text-slate-600">月額</dt>
                <dd className="text-2xl font-black text-navy-900">{pricing.monthlyFee ?? "お問い合わせください"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-600">{pricing.note}</p>
          </div>
          <ul className="space-y-2 rounded-3xl bg-white p-6">
            {salesConfig.included.map((x) => (
              <li key={x} className="flex gap-2 text-sm leading-relaxed text-navy-900">
                <span className="font-black text-brand-600" aria-hidden="true">✓</span>
                {x}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section eyebrow="START" title="導入までの流れ">
        <ol className="grid gap-3 sm:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-3xl bg-white p-4">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-black text-white">{i + 1}</span>
              <p className="mt-2 font-black text-navy-900">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { href: "/for-clinics/guide", icon: "🛠️", t: "導入ガイド", d: "LINE設定・店頭掲示・スタッフ共有の手順" },
            { href: "/for-clinics/sns", icon: "💬", t: "SNS投稿文", d: "Instagram・LINE配信・Googleにそのまま使える文例" },
            { href: "/for-clinics/templates", icon: "🖨️", t: "店頭テンプレート", d: "POP・卓上カード・受付トークを印刷して使える" },
          ].map((r) => (
            <Link key={r.href} href={r.href} className="rounded-3xl border-2 border-brand-200 bg-white p-4 hover:border-brand-400">
              <p className="font-black text-navy-900">
                {r.icon} {r.t} →
              </p>
              <p className="mt-1 text-xs text-slate-600">{r.d}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="FAQ" title="よくあるご質問">
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black text-navy-900">
                Q. {f.q}
                <span className="text-brand-600 group-open:rotate-45" aria-hidden="true">
                  ＋
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">A. {f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="contact" eyebrow="CONTACT" title="まずはデモ・ご相談から">
        <div className="space-y-4 rounded-[2rem] bg-white p-6">
          <p className="text-sm leading-relaxed text-slate-700">
            デモで実際の流れを体験したうえで、貴院の集客の状況に合わせた使い方をご提案します。お気軽にお問い合わせください。
          </p>
          <ContactBlock />
          <Link href="/demo" className={buttonStyles.secondary}>
            📱 先にデモを試してみる
          </Link>
        </div>
      </Section>
    </div>
  );
}
