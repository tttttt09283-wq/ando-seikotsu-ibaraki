import type { ExtraVesselId, ReviewStatus } from "./types";

export interface ConfluentHalf {
  code: string;
  vessel: ExtraVesselId;
  /** 手 or 足 */
  limb: "手" | "足";
}

export interface ConfluentPair {
  id: string;
  upper: ConfluentHalf;
  lower: ConfluentHalf;
  /** 『鍼灸大全』等で組が主る部位 */
  regions: string[];
  rationale: string[];
  symptoms: string[];
  laterality: string[];
  clinical: { title: string; text: string };
  color: string;
  reviewStatus: ReviewStatus;
  sourceIds: string[];
}

const src = ["zhenjiu-daquan", "jp-textbook-points"];

export const confluentPairs: ConfluentPair[] = [
  {
    id: "si3-bl62",
    upper: { code: "SI3", vessel: "GV", limb: "手" },
    lower: { code: "BL62", vessel: "YangHeel", limb: "足" },
    regions: ["目内眥", "頸項", "耳", "肩甲部", "背腰部"],
    rationale: [
      "後渓は手の太陽小腸経、申脈は足の太陽膀胱経。同じ「太陽」の手足の経を組み合わせる",
      "督脈（背部正中）と陽蹻脈（下肢外側〜頭部）が、背部・頸項・目内眥で会合すると考える",
      "手の穴と足の穴を上下で組み、上下の経気を通じさせる",
    ],
    symptoms: ["頸部・項部のこわばり・痛み", "腰背部の痛み", "目内眥の痛み", "耳の症状"],
    laterality: [
      "一側だけに取る方法と、両側に取る方法があり、流派・教科書で扱いが異なる",
      "一例として、主となる穴（主穴）を先に取り、組となる穴（客穴・応穴）を後に取る。主穴を患側、応穴を健側に取るなど左右を分ける考え方もある",
      "本アプリでは特定の流派を正解とせず、所属機関・指導者の方針に従うこと（要確認）",
    ],
    clinical: {
      title: "架空例：起床時からの項部痛（寝違え様）",
      text: "危険徴候（発熱・神経症状・外傷など）がないことを確認したうえで、項部〜肩甲間部の太陽経に沿った痛みと判断し、遠隔の後渓・申脈を取りながら頸部の可動を確認する、という組み立ての例。",
    },
    color: "#6d28d9",
    reviewStatus: "unverified",
    sourceIds: src,
  },
  {
    id: "te5-gb41",
    upper: { code: "TE5", vessel: "YangLink", limb: "手" },
    lower: { code: "GB41", vessel: "BV", limb: "足" },
    regions: ["目外眥", "耳後", "頬", "頸", "肩"],
    rationale: [
      "外関は手の少陽三焦経、足臨泣は足の少陽胆経。同じ「少陽」の手足の経を組み合わせる",
      "陽維脈（諸陽経をつなぐ）と帯脈（腰腹を一周する）が、体の側面（少陽の領域）で関係すると考える",
    ],
    symptoms: ["側頭部の頭痛", "耳鳴・耳後の痛み", "側頸部・肩上部の痛み", "脇肋部の痛み"],
    laterality: [
      "上と同様、主穴・応穴の順序や左右の取り方は流派差がある（要確認）",
      "側頭部痛のように左右差が明確な症状では、どちら側に取るかを記録し、反応を評価して比較できるようにする",
    ],
    clinical: {
      title: "架空例：ストレス時に増悪する側頭部の頭痛",
      text: "突然の激しい頭痛・神経症状などの危険徴候を除外したうえで、側頭部（少陽経の領域）の痛みとして外関・足臨泣を組み合わせる例。頭痛日数・強さを評価項目にする。",
    },
    color: "#86198f",
    reviewStatus: "unverified",
    sourceIds: src,
  },
  {
    id: "lu7-ki6",
    upper: { code: "LU7", vessel: "CV", limb: "手" },
    lower: { code: "KI6", vessel: "YinHeel", limb: "足" },
    regions: ["肺系", "咽喉", "胸膈"],
    rationale: [
      "列欠は手の太陰肺経、照海は足の少陰腎経。肺と腎は「金生水」の関係にあり、呼吸と水の代謝で協調すると考える",
      "任脈（前正中線）と陰蹻脈（咽喉を通る）が、咽喉・胸部で会合すると考える",
    ],
    symptoms: ["咽喉の乾燥・痛み", "咳", "胸のつかえ"],
    laterality: ["主穴・応穴の順序や左右の取り方は流派差がある（要確認）"],
    clinical: {
      title: "架空例：夜間に悪化する咽喉の乾燥感",
      text: "発熱・呼吸困難・嚥下困難などの危険徴候があれば医療機関の受診を優先する。それらがない慢性的な乾燥感で、陰虚の所見（舌の乾燥・少苔など）を伴う場合に、列欠・照海を組み合わせる例。",
    },
    color: "#7e22ce",
    reviewStatus: "unverified",
    sourceIds: src,
  },
  {
    id: "pc6-sp4",
    upper: { code: "PC6", vessel: "YinLink", limb: "手" },
    lower: { code: "SP4", vessel: "TV", limb: "足" },
    regions: ["心", "胸", "胃"],
    rationale: [
      "内関は手の厥陰心包経、公孫は足の太陰脾経。胸（心）と腹（胃）を上下でつなぐ組み合わせ",
      "陰維脈（諸陰経をつなぐ）と衝脈（腹部を上行し胸中に散る）が、胸・胃で会合すると考える",
    ],
    symptoms: ["胸苦しさ", "胃痛", "悪心・嘔吐", "腹部膨満"],
    laterality: ["主穴・応穴の順序や左右の取り方は流派差がある（要確認）"],
    clinical: {
      title: "架空例：食後の胃のつかえと悪心",
      text: "胸痛・吐血・黒色便・体重減少などの危険徴候がないことを確認し、医師の診断を受けている前提で、胃のつかえ感に内関・公孫を組み合わせる例。症状の頻度・食事量を評価項目にする。",
    },
    color: "#9333ea",
    reviewStatus: "unverified",
    sourceIds: src,
  },
];
