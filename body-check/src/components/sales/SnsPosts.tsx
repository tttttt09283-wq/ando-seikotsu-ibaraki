"use client";

import { CopyButton, fill, PersonalizeForm, usePersonalize } from "./Personalize";

interface Post {
  title: string;
  note?: string;
  text: string;
}
interface Group {
  id: string;
  icon: string;
  name: string;
  tip: string;
  posts: Post[];
}

const HASHTAGS = "#カラダ年齢チェック #セルフチェック #姿勢 #体力チェック #整骨院 #{院名}";

const GROUPS: Group[] = [
  {
    id: "instagram",
    icon: "📸",
    name: "Instagram（フィード投稿）",
    tip: "1枚目は「あなたのカラダ、何歳レベル？」の大きな文字＋チェック画面のスクリーンショットがおすすめ。URLはプロフィールのリンクに設置します。",
    posts: [
      {
        title: "① 告知（はじめての案内）",
        text: `あなたのカラダ、何歳レベル？🧍‍♀️

{院名}で「カラダ年齢チェック」を始めました！

✅ スマホで約3分
✅ 登録・ログイン不要
✅ 片足立ち・椅子立ち上がりなど5つの簡単チェック

結果は「〇〇代レベル」とスコアで表示。
今の身体の状態を知るきっかけに、ぜひ試してみてください😊

▶ プロフィールのリンクから無料でできます

※医療診断ではなく、身体の状態を知るための目安です
${HASHTAGS}`,
      },
      {
        title: "② チェック項目の紹介",
        text: `「30秒で椅子から何回立てる？」🪑

カラダ年齢チェックの5つの項目👇
1️⃣ 片足立ち（バランス）
2️⃣ 30秒椅子立ち上がり（下半身）
3️⃣ 前屈（柔軟性）
4️⃣ 両腕上げ（肩の動き）
5️⃣ 最近のコンディション

どれもおうちで、ひとりでできます。
あなたはどの項目が得意ですか？コメントで教えてください✨

▶ プロフィールのリンクから約3分
${HASHTAGS}`,
      },
      {
        title: "④ 4つのチェックの紹介",
        text: `{院名}のLINEから、4つのセルフチェックができます📱

🧍 カラダ年齢チェック（約3分）
　…あなたのカラダは何歳レベル？
📸 AI姿勢チェック（約2分）
　…写真からAIが猫背・反り腰・左右の傾きをチェック
🧬 骨格タイプチェック（約2分）
　…ストレート／ウェーブ／ナチュラル、あなたはどれ？
💪 体幹チェック（約5分）
　…プランクなどで体を支える力をチェック

気になるものから、気軽に試してみてください😊
▶ プロフィールのリンクから
${HASHTAGS}`,
      },
      {
        title: "⑤ AI姿勢チェックの紹介",
        text: `スマホで撮るだけ📸 AIがあなたの姿勢をチェック！

横向きと正面の写真から
・頭が前に出ていないか（ストレートネック傾向）
・猫背・反り腰になっていないか
・肩や骨盤が左右に傾いていないか
を点数でお知らせします。

写真はスマホの中だけで解析し、どこにも送信されません🔒

▶ プロフィールのリンクから
※医療診断ではなく、姿勢の傾向を知るための目安です
${HASHTAGS} #姿勢チェック`,
      },
      {
        title: "③ 結果の見方",
        text: `カラダ年齢チェック、結果はこんな風に出ます📊

・カラダ年齢（〇〇代レベル）
・総合スコアとランク
・5項目のレーダーチャート
・あなたに合ったセルフケア

「思ったより若かった！」「下半身が意外と…」
自分の身体の“クセ”を知るだけでも、毎日の過ごし方が変わります。

気になる結果が出たら、{院名}で詳しく確認できます😊
{特典}

▶ プロフィールのリンクから
${HASHTAGS}`,
      },
    ],
  },
  {
    id: "stories",
    icon: "🎬",
    name: "Instagram（ストーリーズ）",
    tip: "リンクスタンプにチェックページのURLを設定します。質問スタンプ・アンケートスタンプと組み合わせると反応が増えます。",
    posts: [
      { title: "① アンケート付き", text: "あなたのカラダ、何歳レベルだと思う？🤔\n\n（アンケート：実年齢より若い／同じくらい／上かも…）\n\n3分でチェックできるよ👇\n（リンクスタンプ：カラダ年齢チェック）" },
      { title: "② スタッフがやってみた", text: "スタッフがやってみました！\n結果は…「〇〇代レベル」でした😂\n\nみなさんも3分でできるので\nぜひ試してみてください👇\n（リンクスタンプ）" },
    ],
  },
  {
    id: "line",
    icon: "💚",
    name: "LINE配信（友だちへの一斉配信）",
    tip: "リッチメニューにチェックを設置したうえで配信すると、配信後もいつでも開けます。配信は月1〜2回が目安です。",
    posts: [
      {
        title: "① 開始のお知らせ",
        text: `【新しくなりました🎉】
{院名}のLINEから「カラダ年齢チェック」ができるようになりました！

あなたのカラダ、何歳レベル？
スマホで約3分、登録なしでできます。

▼チェックはこちら
{URL}

（下のメニューの「カラダ年齢チェック」からもできます）
{特典}`,
      },
      {
        title: "② 季節の声かけ（リマインド）",
        text: `最近、階段や立ち上がりで「よいしょ」と言っていませんか？😅

季節の変わり目は、身体の変化に気づきやすいタイミング。
3分の「カラダ年齢チェック」で、今の状態を確かめてみませんか？

▼チェックはこちら
{URL}`,
      },
      {
        title: "③ 再チェックのご案内（通院中・過去に来院した方へ）",
        text: `前回の「カラダ年齢チェック」から1か月が経ちました🌱

施術やセルフケアを続けて、身体はどう変わったでしょうか？
もう一度チェックして、前回と比べてみましょう😊

▼再チェックはこちら
{URL}

結果は次回のご来院時に、一緒に確認させてください。`,
      },
    ],
  },
  {
    id: "x",
    icon: "🧵",
    name: "X（旧Twitter）・Threads",
    tip: "短く・問いかけで。画像（チェック画面のスクリーンショット）を1枚付けると目に留まりやすくなります。",
    posts: [
      { title: "① 問いかけ", text: "30秒で、椅子から何回立ち上がれますか？🪑\n\n回数で分かる「カラダ年齢」、3分でチェックできます👇\n{URL}\n\n#カラダ年齢チェック #{院名}" },
      { title: "③ 体幹チェック", text: "プランク、何秒キープできますか？💪\n\n4つのテストで体幹の強さと左右差が分かる「体幹チェック」、おうちで5分です👇\n{URL}" },
      { title: "② 気軽さを伝える", text: "登録なし・スマホで3分。\n「あなたのカラダ、何歳レベル？」が分かるセルフチェックを公開中です✨\n{URL}" },
    ],
  },
  {
    id: "google",
    icon: "📍",
    name: "Googleビジネスプロフィール（最新情報）",
    tip: "「最新情報」に投稿し、ボタンを「詳細」にしてチェックページのURLを設定します。",
    posts: [
      {
        title: "① 最新情報の投稿",
        text: `【3分でできる「カラダ年齢チェック」を公開中】
{院名}では、スマホで約3分でできるセルフ身体チェックをご用意しています。片足立ち・椅子立ち上がり・前屈・肩の動き・コンディションの5項目で、今の身体の状態を「カラダ年齢」とスコアで確認できます。登録は不要です。
気になる結果が出た方は、お気軽にご相談ください。
※医療診断ではなく、身体の状態を知るための目安です。`,
      },
    ],
  },
];

export function SnsPosts() {
  const { v } = usePersonalize();
  return (
    <div className="space-y-8">
      <PersonalizeForm />
      <nav aria-label="媒体" className="no-print flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="rounded-full border-2 border-brand-200 bg-white px-3 py-1 text-sm font-bold text-navy-900">
            {g.icon} {g.name}
          </a>
        ))}
      </nav>
      {GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-6">
          <h2 className="text-xl font-black text-navy-900">
            {g.icon} {g.name}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">💡 {g.tip}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {g.posts.map((p) => {
              const text = fill(p.text, v);
              return (
                <article key={p.title} className="flex flex-col rounded-3xl bg-white p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-black text-navy-900">{p.title}</h3>
                    <CopyButton text={text} />
                  </div>
                  <pre className="mt-3 flex-1 whitespace-pre-wrap break-words rounded-2xl bg-brand-50 p-4 font-sans text-sm leading-relaxed text-navy-900">{text}</pre>
                  <p className="mt-2 text-right text-xs text-slate-500">{text.length}文字</p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      <p className="rounded-2xl bg-sun-100 p-4 text-xs leading-relaxed text-navy-900">
        ⚠️ 投稿の際は「診断」「治る」「必ず改善」などの表現は避けてください。施術の効果や体験談を載せる場合は、柔道整復・あはきの広告に関するルールをご確認ください。
      </p>
    </div>
  );
}
