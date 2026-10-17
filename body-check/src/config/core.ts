/**
 * ===== 体幹チェックの設定 =====
 * 自宅でできる4つの簡単なテスト。秒数・できばえを1〜4点にし、合計を100点満点に換算します。
 * 一般的な体力テストを参考にした独自の目安で、医療的な評価ではありません。
 */
export type CoreTestId = "plank" | "side" | "bridge" | "seated";

export interface CoreTest {
  id: CoreTestId;
  name: string;
  short: string;
  howTo: string[];
  /** 秒数で測る場合の区切り（これ以上で2点・3点・4点） */
  thresholds?: [number, number, number];
  /** 左右それぞれ測る */
  bothSides?: boolean;
  /** できばえを選ぶ場合の選択肢（点数つき） */
  options?: { label: string; points: number }[];
  maxSeconds?: number;
  weakText: string;
  selfcare: { title: string; text: string };
}

export const CORE_TESTS: CoreTest[] = [
  {
    id: "plank",
    name: "フロントプランク",
    short: "前",
    howTo: ["うつ伏せから、ひじと つま先で体を支えます", "頭からかかとまでを一直線にして、キープできた秒数を計ります", "腰が反る・お尻が上がったところで終了です"],
    thresholds: [20, 40, 60],
    maxSeconds: 120,
    weakText: "お腹の前側（腹筋群）で体を支える力が弱めです。腰が反りやすく、腰に負担がかかりやすい状態です。",
    selfcare: { title: "ドローイン（寝たまま腹式呼吸）", text: "仰向けでひざを立て、息を吐きながらおへそを背中に近づけるようにお腹をへこませ、10秒キープ。5回×1日2セット。" },
  },
  {
    id: "side",
    name: "サイドプランク（左右）",
    short: "横",
    howTo: ["横向きに寝て、下側のひじと足の外側で体を支えます", "体を一直線にしてキープできた秒数を、左右それぞれ計ります", "つらい場合は、ひざをついた姿勢でもかまいません"],
    thresholds: [15, 30, 45],
    bothSides: true,
    maxSeconds: 90,
    weakText: "わき腹（腹斜筋）の支える力が弱め、または左右差があります。体が左右に傾きやすく、片側の腰に負担がかかりやすい状態です。",
    selfcare: { title: "ひざつきサイドプランク", text: "横向きでひざを曲げ、ひじとひざで体を支えて腰を持ち上げます。15秒×左右2回から始めましょう。" },
  },
  {
    id: "bridge",
    name: "片脚ヒップリフト（左右）",
    short: "お尻",
    howTo: ["仰向けでひざを立て、片脚を伸ばして床から浮かせます", "床についている脚でお尻を持ち上げ、5秒キープを左右それぞれ行います", "腰ではなく、お尻の力で持ち上げるのがポイントです"],
    bothSides: true,
    options: [
      { label: "持ち上げられない", points: 1 },
      { label: "上がるが、ぐらつく・お尻が下がる", points: 2 },
      { label: "少しぐらつくが、5秒キープできる", points: 3 },
      { label: "まっすぐ安定して5秒キープできる", points: 4 },
    ],
    weakText: "お尻（大殿筋・中殿筋）で骨盤を支える力が弱め、または左右差があります。腰や太もも裏で代わりに頑張りやすい状態です。",
    selfcare: { title: "両脚ヒップリフト", text: "仰向けでひざを立て、お尻をゆっくり持ち上げて3秒キープ、ゆっくり下ろします。10回×1日1〜2セット。" },
  },
  {
    id: "seated",
    name: "座って脚上げキープ",
    short: "座位",
    howTo: ["安定した椅子に浅く座り、手は胸の前で組みます", "背すじを伸ばしたまま、両足を床から5cmほど浮かせます", "後ろにもたれずにキープできた秒数を計ります"],
    thresholds: [10, 20, 30],
    maxSeconds: 60,
    weakText: "お腹の深い筋肉（インナーマッスル）で姿勢を保つ力が弱めです。座っている時に猫背になりやすい状態です。",
    selfcare: { title: "デッドバグ（寝たまま手足を動かす）", text: "仰向けで両手を天井へ、ひざを90度に上げます。腰を床につけたまま、右手と左脚をゆっくり伸ばして戻す。左右交互に8回。" },
  },
];

export const CORE_RANKS = [
  { min: 85, id: "S", title: "Sランク", message: "体幹がしっかり安定しています。今の状態をキープしましょう。" },
  { min: 70, id: "A", title: "Aランク", message: "体幹は良い状態です。弱い項目を鍛えると、さらに安定します。" },
  { min: 50, id: "B", title: "Bランク", message: "体幹にやや弱いところがあります。セルフケアで少しずつ鍛えましょう。" },
  { min: 0, id: "C", title: "Cランク", message: "体幹で体を支える力が弱めです。腰痛や姿勢の崩れにつながりやすいので、早めのケアがおすすめです。" },
] as const;
