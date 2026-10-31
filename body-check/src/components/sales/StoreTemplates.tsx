"use client";

import { useRef } from "react";
import { CHECK_META, CHECK_ORDER } from "@/config/checks";
import { CheckIllustration } from "@/components/Illustrations";
import { CopyButton, fill, PersonalizeForm, QrImage, usePersonalize } from "./Personalize";

/** 1枚だけ印刷する（ほかのシートは印刷しない） */
function usePrintOne() {
  return (el: HTMLElement | null) => {
    if (!el) return;
    el.classList.add("print-target");
    document.body.dataset.printOnly = "1";
    const done = () => {
      el.classList.remove("print-target");
      delete document.body.dataset.printOnly;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    window.setTimeout(done, 1500);
  };
}

function Sheet({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const printOne = usePrintOne();
  return (
    <section className="space-y-3">
      <div className="no-print flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-black text-navy-900">{title}</h2>
          <p className="text-sm text-slate-700">{desc}</p>
        </div>
        <button type="button" onClick={() => printOne(ref.current)} className="rounded-full bg-navy-900 px-4 py-2 text-sm font-bold text-white">
          🖨️ このテンプレートを印刷
        </button>
      </div>
      <div ref={ref} className="print-sheet rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgba(30,58,95,0.08)] sm:p-6">
        {children}
      </div>
    </section>
  );
}

function Script({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border-2 border-brand-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black text-navy-900">{title}</h3>
        <CopyButton text={text} />
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-navy-900">{text}</pre>
    </div>
  );
}

const RECEPTION = [
  {
    title: "① 受付・お会計のとき（基本の一言）",
    text: `「今、LINEで“カラダ年齢チェック”ができるんです。スマホで3分くらいなので、よかったら待ち時間や、おうちで試してみてください。（ポスター・カードのQRコードを指して）こちらから始められます。」`,
  },
  {
    title: "② 待ち時間に（一緒にやるとき）",
    text: `「お待ちの間に、カラダ年齢チェックをやってみませんか？片足立ち・プランク・前屈・スクワットの簡単な動きだけです。痛みが出そうな項目は、無理せず“スキップ”して大丈夫ですよ。」`,
  },
  {
    title: "③ 新規の電話・問い合わせで迷っている方に",
    text: `「まずはご自身の今の状態を知っていただくのがおすすめです。LINEの“カラダ年齢チェック”を3分ほどでやっていただいて、結果画面から気になる点を書いてご予約いただくと、当日その内容から詳しく確認させていただきます。」`,
  },
  {
    title: "④ ご家族・ご紹介",
    text: `「ご家族やお友だちにも、よかったら教えてあげてください。“姿勢・体幹年齢”が何歳か比べてみると盛り上がりますよ。」`,
  },
];

const RESULT_TALK = [
  {
    title: "① 最初のひとこと（カラダチェック経由の方）",
    text: `「カラダ年齢チェックの結果、拝見しました。〇〇の項目が少し低めだったので、今日はそこを中心に、実際の動きで詳しく確認させてください。」`,
  },
  {
    title: "② 結果を一緒に見るとき",
    text: `「（結果画面を一緒に見ながら）こちらのレーダーチャートで、へこんでいるところが“伸びしろ”です。〇〇さんは〔下半身／バランス／柔軟性／肩〕が低めでした。普段、〔立ち上がり・階段・つまずき・肩の上げ下げ〕で気になることはありますか？」`,
  },
  {
    title: "③ 検査後のまとめ",
    text: `「チェックで出ていた〇〇の低さは、実際に見ると〔原因の説明〕が関係していそうです。ここが整うと、〔日常の動作〕が楽になりやすいので、まずは〔期間〕で〔目標〕を目指しましょう。」`,
  },
  {
    title: "④ 次回の約束（再チェック）",
    text: `「1か月後に、もう一度カラダ年齢チェックをやって、今日と比べてみましょう。数字で変化が見えると励みになりますよ。」`,
  },
];

const PROPOSAL = [
  {
    title: "通院・プランのご提案（成約の場面）",
    text: `「今日のチェックと検査の結果から、〔目標〕のためには、最初の〔期間〕は〔頻度〕のペースで来ていただくのがおすすめです。そのペースで通われる方には〔回数券・定期プラン〕もご用意しています。料金と内容をご説明してもよろしいですか？」`,
  },
  {
    title: "迷われているとき",
    text: `「すぐに決めなくて大丈夫です。まずは今日お伝えしたセルフケアを続けてみてください。1か月後のカラダ年齢チェックで変化を見て、そのときにまた一緒に考えましょう。」`,
  },
];

const LINE_MSGS = [
  {
    title: "予約確定のあと（来院前日など）",
    text: `{院名}です。カラダ年齢チェックからのご予約ありがとうございます😊
チェックの結果を拝見し、当日はその内容を中心に確認させていただきます。
動きやすい服装でお越しください。
ご不明な点は、このトークでお気軽にどうぞ。`,
  },
  {
    title: "来院の翌日（フォロー）",
    text: `{院名}です。昨日はご来院ありがとうございました。
その後、お身体の調子はいかがですか？
お伝えしたセルフケアは、無理のない範囲で続けてみてくださいね。
1か月後に、もう一度カラダ年齢チェックで変化を確認しましょう😊
{URL}`,
  },
];

export function StoreTemplates() {
  const { v } = usePersonalize();
  const url = v.checkUrl;
  return (
    <div className="space-y-12">
      <PersonalizeForm />

      <Sheet title="A4 ポスター" desc="受付・待合・トイレなど、目に入る場所に。QRコードは入力したURLで自動作成されます。">
        <div className="mx-auto max-w-[640px] overflow-hidden rounded-2xl border-4 border-brand-500 text-center text-navy-900">
          <div className="bg-brand-500 px-6 py-6 text-white">
            <p className="text-lg font-bold">{v.clinicName}</p>
            <p className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
              あなたの姿勢・体幹は
              <br />
              <span className="text-sun-300">何歳？</span>
            </p>
          </div>
          <div className="space-y-4 px-6 py-6">
            <p className="text-2xl font-black">
              スマホで選べる<span className="text-brand-600">4つ</span>の無料チェック
            </p>
            <p className="text-base font-bold">🧍 カラダ年齢　📸 AI姿勢　🧬 骨格タイプ　💪 体幹</p>
            <ul className="grid grid-cols-4 gap-1">
              {CHECK_ORDER.map((id) => (
                <li key={id} className="flex flex-col items-center gap-1">
                  <CheckIllustration id={id} className="size-14" />
                  <span className="text-xs font-bold">{CHECK_META[id].shortName}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-center gap-5">
              <QrImage value={url} size={170} />
              <div className="text-left">
                <p className="text-xl font-black">QRコードを読み取って</p>
                <p className="text-xl font-black text-brand-600">すぐスタート！</p>
                <p className="mt-2 text-sm">✓ 登録・ログイン不要</p>
                <p className="text-sm">✓ 無料</p>
              </div>
            </div>
            {v.benefit && <p className="rounded-2xl bg-sun-100 px-4 py-3 text-lg font-black">🎁 {v.benefit}</p>}
            <p className="text-xs text-slate-600">※本チェックは医療診断ではありません。身体の状態を知るための目安です。痛みがある場合は無理をしないでください。</p>
          </div>
        </div>
      </Sheet>

      <Sheet title="卓上カード（2枚どり）" desc="受付カウンター・施術ベッドの近くに。切り取って三角POPやカード立てに。">
        <div className="mx-auto grid max-w-[640px] gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border-2 border-dashed border-brand-300 p-4 text-center text-navy-900">
              <p className="text-xs font-bold text-brand-700">{v.clinicName}</p>
              <p className="mt-1 text-xl font-black leading-snug">
                あなたの姿勢・体幹は
                <br />
                <span className="text-brand-600">何歳？</span>
              </p>
              <QrImage value={url} size={120} className="mx-auto mt-2" />
              <p className="mt-2 text-sm font-bold">待ち時間に、スマホで約3分</p>
              {v.benefit && <p className="mt-1 text-xs font-bold text-sun-500">🎁 {v.benefit}</p>}
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet title="受付トーク（声かけの台本）" desc="スタッフ全員で同じ一言を使うと、チェック数が安定します。">
        <div className="grid gap-3 md:grid-cols-2">
          {RECEPTION.map((s) => (
            <Script key={s.title} title={s.title} text={fill(s.text, v)} />
          ))}
        </div>
      </Sheet>

      <Sheet title="結果説明トーク（来院時）" desc="カラダチェック経由で来院された方に。〔 〕の部分を、その方の結果に合わせて言い換えてください。">
        <div className="grid gap-3 md:grid-cols-2">
          {RESULT_TALK.map((s) => (
            <Script key={s.title} title={s.title} text={fill(s.text, v)} />
          ))}
        </div>
      </Sheet>

      <Sheet title="提案・フォローのトーク" desc="押し売りにならない、目標から逆算した提案の型です。">
        <div className="grid gap-3 md:grid-cols-2">
          {PROPOSAL.map((s) => (
            <Script key={s.title} title={s.title} text={fill(s.text, v)} />
          ))}
        </div>
      </Sheet>

      <Sheet title="LINEメッセージ（予約後・来院後）" desc="1対1のトークで送る文例です。">
        <div className="grid gap-3 md:grid-cols-2">
          {LINE_MSGS.map((s) => (
            <Script key={s.title} title={s.title} text={fill(s.text, v)} />
          ))}
        </div>
      </Sheet>
    </div>
  );
}
