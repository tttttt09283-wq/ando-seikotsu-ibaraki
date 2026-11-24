import type { Chapter, Lesson } from "./types";
import { meridianIntro } from "./lessons/meridian-intro";
import { fiveElements, qiBloodFluid, yinYang, zangFu } from "./lessons/chapter1";
import { jingjinJingbie, jingLuo, piBu } from "./lessons/chapter2";
import { flowOverview, footChannels, handChannels, pairsAndSymptoms } from "./lessons/chapter3";

/** 準備中の講義を作る */
function planned(chapterId: string, titles: [string, string][]): Lesson[] {
  return titles.map(([title, summary], i) => ({
    id: `${chapterId}-l${i + 1}`,
    chapterId,
    number: i + 1,
    title,
    summary,
    minutes: 20,
    status: "planned",
    reviewStatus: "unverified",
    sourceIds: [],
  }));
}

export const chapters: Chapter[] = [
  {
    id: "c1",
    number: 1,
    title: "東洋医学の基礎",
    subtitle: "陰陽・五行・気血津液・臓腑",
    description: "最初に「経絡とは何か」で全体像をつかみ、経絡と経穴を理解する土台となる理論を学ぶ。",
    color: "#1e3a6b",
    lessons: [meridianIntro, yinYang, fiveElements, qiBloodFluid, zangFu],
  },
  {
    id: "c2",
    number: 2,
    title: "経絡の基礎",
    subtitle: "経脈・絡脈・経筋・経別",
    description: "経絡がどのような要素で構成され、診察と治療にどう使われるかを学ぶ。",
    color: "#1e40af",
    lessons: [jingLuo, jingjinJingbie, piBu],
  },
  {
    id: "c3",
    number: 3,
    title: "十二経脈",
    subtitle: "流注・表裏・病候",
    description: "12本の正経の走行と、表裏関係・病候を学ぶ。",
    color: "#2563eb",
    lessons: [flowOverview, handChannels, footChannels, pairsAndSymptoms],
  },
  {
    id: "c4",
    number: 4,
    title: "経穴学",
    subtitle: "正経穴・奇穴・阿是穴・取穴",
    description: "経穴の分類と、正確に取穴するための方法。",
    color: "#0f766e",
    lessons: planned("c4", [
      ["正経穴・奇穴・阿是穴", "経穴の3分類と、それぞれの使い方。"],
      ["骨度法と同身寸", "体の比率で位置を決める方法と、その限界。"],
      ["取穴の実際", "体表指標・触診での確認と、記録のしかた。"],
    ]),
  },
  {
    id: "c5",
    number: 5,
    title: "要穴",
    subtitle: "五兪穴・原穴・絡穴・郄穴・兪募穴・八会穴・下合穴",
    description: "特別な性質をもつ経穴の分類と、臨床での使い分け。",
    color: "#b45309",
    lessons: planned("c5", [
      ["五兪穴", "井・滎・兪・経・合穴と五行配当、母子補瀉。"],
      ["原穴・絡穴", "原絡配穴と、表裏経の関係。"],
      ["郄穴", "急性症状に用いる考え方。"],
      ["背部兪穴・募穴", "臓腑の反応点としての兪募穴。"],
      ["八会穴・下合穴", "組織ごとの会穴と、六腑の下合穴。"],
    ]),
  },
  {
    id: "c6",
    number: 6,
    title: "奇経八脈",
    subtitle: "循行・病候・八脈交会穴",
    description: "十二経脈を調節する8本の経絡と、八脈交会穴。",
    color: "#7a3e9d",
    lessons: planned("c6", [
      ["督脈・任脈・衝脈・帯脈", "体幹を縦・横に走る奇経の循行と病候。"],
      ["陰陽維脈・陰陽蹻脈", "四肢から頭部へ向かう奇経の循行と病候。"],
      ["八脈交会穴", "4組8穴の組み合わせと配穴の根拠。"],
    ]),
  },
  {
    id: "c7",
    number: 7,
    title: "診察",
    subtitle: "四診・八綱・臓腑弁証・経絡弁証",
    description: "情報を集め、証を立てるまでの思考の流れ。",
    color: "#334155",
    lessons: planned("c7", [
      ["四診", "望・聞・問・切の進め方と記録。"],
      ["八綱弁証", "表裏・寒熱・虚実・陰陽の判定。"],
      ["臓腑弁証", "臓腑ごとの代表的な証。"],
      ["経絡弁証", "症状の部位と経絡を結びつける方法。"],
    ]),
  },
  {
    id: "c8",
    number: 8,
    title: "治療",
    subtitle: "本治・標治・補瀉・鍼灸の使い分け",
    description: "証から治則・配穴・手技を組み立てる。",
    color: "#155e75",
    lessons: planned("c8", [
      ["本治と標治", "根本と症状のどちらを優先するか。"],
      ["補瀉", "補法・瀉法の考え方と手技。"],
      ["鍼と灸の使い分け", "病態・体質による選択と安全管理。"],
    ]),
  },
  {
    id: "c9",
    number: 9,
    title: "臨床",
    subtitle: "頸肩部痛・腰痛・坐骨神経痛・五十肩など",
    description: "よくみる運動器症状への評価と鍼灸の組み立て。",
    color: "#9a3412",
    lessons: planned("c9", [
      ["頸肩部痛", "危険徴候の除外と、部位別の経絡の考え方。"],
      ["腰痛", "非特異的腰痛とレッドフラッグ、経絡・経筋。"],
      ["坐骨神経痛", "神経根症状の評価と鍼灸の位置づけ。"],
      ["五十肩", "病期に応じた評価と施術。"],
    ]),
  },
  {
    id: "c10",
    number: 10,
    title: "専門",
    subtitle: "神経障害性疼痛・パーキンソン病などの神経難病",
    description: "医師と連携しながら鍼灸が担う役割を学ぶ。",
    color: "#3f3f46",
    lessons: planned("c10", [
      ["神経障害性疼痛", "病態の理解と、評価・連携のポイント。"],
      ["パーキンソン病", "運動症状・非運動症状と鍼灸のかかわり方。"],
      ["神経難病と多職種連携", "主治医・リハビリ職との情報共有と安全管理。"],
    ]),
  },
];

export const allLessons: Lesson[] = chapters.flatMap((c) => c.lessons);
export const lessonMap = Object.fromEntries(allLessons.map((l) => [l.id, l])) as Record<string, Lesson>;
export const chapterMap = Object.fromEntries(chapters.map((c) => [c.id, c])) as Record<string, Chapter>;
export const publishedLessons = allLessons.filter((l) => l.status === "published");

/** 最初に学ぶ講義 */
export const firstLesson = publishedLessons[0];
