/**
 * ===== セルフケアの設定ファイル =====
 * 一般的で低負荷な運動のみを掲載しています。
 * 内容の追加・修正は、このリストを書き換えるだけで画面に反映されます。
 *
 * videoUrl に YouTube の「埋め込み用URL」（https://www.youtube.com/embed/〜）を入れると、
 * 結果画面に動画が表示されます（未設定なら表示されません）。
 */
import type { CheckId } from "@/types";

export interface SelfCareItem {
  id: string;
  category: CheckId;
  name: string;
  purpose: string;
  steps: string[];
  /** 回数または時間 */
  amount: string;
  cautions: string[];
  /** 痛みがある方にも比較的取り入れやすい、ごく軽い内容か */
  gentle: boolean;
  videoUrl?: string;
}

export const SELF_CARE_ITEMS: SelfCareItem[] = [
  // ----- バランス -----
  {
    id: "balance-support-stand",
    category: "balance",
    name: "つかまり片足立ち",
    purpose: "片足で身体を支える感覚を養い、ふらつきにくい身体をめざします。",
    steps: [
      "机やしっかりした椅子の背もたれに、片手を軽く添えて立ちます。",
      "背すじを伸ばし、片足を床から5cmほど浮かせます。",
      "目線はまっすぐ前へ。ゆっくり呼吸しながらキープします。",
    ],
    amount: "左右それぞれ1分 × 1日3回",
    cautions: ["必ずすぐにつかまれる場所で行いましょう。", "ふらつきが強いときは、両手で支えて行いましょう。"],
    gentle: false,
  },
  {
    id: "balance-heel-toe",
    category: "balance",
    name: "その場で足ぶみ",
    purpose: "左右の足へのスムーズな体重移動を練習します。",
    steps: [
      "壁や椅子の近くに立ちます。",
      "太ももを軽く上げながら、ゆっくり足ぶみをします。",
      "上げた足と反対側の足に、しっかり体重を乗せることを意識します。",
    ],
    amount: "30秒 × 2〜3セット",
    cautions: ["床が滑りにくい場所で行いましょう。", "息が上がらないペースで行いましょう。"],
    gentle: true,
  },
  // ----- 下半身 -----
  {
    id: "legs-chair-stand",
    category: "legs",
    name: "ゆっくり椅子立ち座り",
    purpose: "太ももやお尻の筋肉を使い、立ち座りや階段をラクにします。",
    steps: [
      "安定した椅子に浅めに座り、足を肩幅に開きます。",
      "胸の前で腕を組むか、膝に手を添えます。",
      "おじぎをするように上体を前に倒し、ゆっくり立ち上がります。",
      "3秒ほどかけて、ゆっくり座ります。",
    ],
    amount: "5〜10回 × 2セット",
    cautions: ["膝や腰に痛みが出る場合は中止しましょう。", "椅子は壁につけるなど、動かないようにしましょう。"],
    gentle: false,
  },
  {
    id: "legs-calf-raise",
    category: "legs",
    name: "かかと上げ",
    purpose: "ふくらはぎを動かして、歩く力と足のめぐりをサポートします。",
    steps: [
      "椅子の背もたれや壁に手を添えて立ちます。",
      "ゆっくりとかかとを上げ、つま先立ちになります。",
      "ゆっくりとかかとを下ろします。",
    ],
    amount: "10回 × 2セット",
    cautions: ["反動をつけず、ゆっくり行いましょう。", "足がつりそうなときは休みましょう。"],
    gentle: true,
  },
  // ----- 柔軟性 -----
  {
    id: "flex-hamstring",
    category: "flexibility",
    name: "座ってもも裏ストレッチ",
    purpose: "太ももの裏をのばし、前かがみの動きをスムーズにします。",
    steps: [
      "椅子に浅く座り、片脚を前に伸ばしてかかとを床につけます。",
      "背すじを伸ばしたまま、おへそを太ももに近づけるように上体を前へ倒します。",
      "太ももの裏が気持ちよく伸びるところで止めます。",
    ],
    amount: "左右それぞれ20〜30秒 × 2回",
    cautions: ["反動をつけないようにしましょう。", "「痛気持ちいい」手前でとめ、呼吸は止めないようにしましょう。"],
    gentle: true,
  },
  {
    id: "flex-hip",
    category: "flexibility",
    name: "座ってお尻ストレッチ",
    purpose: "お尻まわりの筋肉をゆるめ、腰まわりの動きをサポートします。",
    steps: [
      "椅子に座り、片方の足首を反対側の膝の上に乗せます。",
      "背すじを伸ばしたまま、ゆっくり上体を前に倒します。",
      "お尻が伸びるのを感じたらキープします。",
    ],
    amount: "左右それぞれ20〜30秒 × 2回",
    cautions: ["股関節や膝に痛みがある場合は行わないでください。"],
    gentle: false,
  },
  // ----- 肩の動き -----
  {
    id: "shoulder-circle",
    category: "shoulder",
    name: "肩まわし",
    purpose: "肩と肩甲骨まわりを動かし、腕を上げる動きをラクにします。",
    steps: [
      "両手の指先を、それぞれの肩に軽く乗せます。",
      "肘で大きな円を描くように、ゆっくり肩をまわします。",
      "前回し・後ろ回しの両方を行います。",
    ],
    amount: "前後それぞれ10回",
    cautions: ["痛みのない範囲の大きさでまわしましょう。"],
    gentle: true,
  },
  {
    id: "shoulder-blade",
    category: "shoulder",
    name: "肩甲骨よせ",
    purpose: "丸まりがちな背中を整え、肩まわりのこわばりをほぐします。",
    steps: [
      "背すじを伸ばして座るか立ちます。",
      "肘を軽く曲げ、胸を開くように左右の肩甲骨を背中の中心へ寄せます。",
      "5秒キープして、ゆっくり力を抜きます。",
    ],
    amount: "10回",
    cautions: ["首に力が入りすぎないようにしましょう。"],
    gentle: true,
  },
  // ----- コンディション -----
  {
    id: "condition-breathing",
    category: "condition",
    name: "おなか深呼吸",
    purpose: "ゆったりした呼吸で、身体と気持ちのリラックスをサポートします。",
    steps: [
      "楽な姿勢で座るか、仰向けになります。",
      "鼻から4秒かけて、おなかをふくらませるように息を吸います。",
      "口から6〜8秒かけて、ゆっくり息を吐きます。",
    ],
    amount: "1〜3分（寝る前や起きたときに）",
    cautions: ["気分が悪くなったら、普段の呼吸に戻しましょう。"],
    gentle: true,
  },
  {
    id: "condition-posture-reset",
    category: "condition",
    name: "こまめな姿勢リセット",
    purpose: "同じ姿勢が続くことによる身体の負担を減らします。",
    steps: [
      "30分〜1時間に1回を目安に、いったん立ち上がります。",
      "両手を組んで頭の上にのばし、大きく伸びをします。",
      "その場で軽く足ぶみをしてから、作業に戻ります。",
    ],
    amount: "30分〜1時間に1回",
    cautions: ["立ちくらみがある場合は、ゆっくり立ち上がりましょう。"],
    gentle: true,
  },
];

/** 結果画面に表示するセルフケアの最大数 */
export const MAX_SELF_CARE_RECOMMENDATIONS = 3;
