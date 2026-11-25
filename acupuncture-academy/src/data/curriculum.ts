import type { Chapter, Lesson } from "./types";
import { meridianIntro } from "./lessons/meridian-intro";
import { fiveElements, qiBloodFluid, yinYang, zangFu } from "./lessons/chapter1";
import { jingjinJingbie, jingLuo, piBu } from "./lessons/chapter2";
import { flowOverview, footChannels, handChannels, pairsAndSymptoms } from "./lessons/chapter3";
import { boneProportion, locatingPractice, pointTypes } from "./lessons/chapter4";
import { fiveShu, huiHe, shuMu, xiPoints, yuanLuo } from "./lessons/chapter5";
import { confluentLesson, limbVessels, trunkVessels } from "./lessons/chapter6";
import { channelPatterns, eightPrinciples, fourExams, zangfuPatterns } from "./lessons/chapter7";
import { biaoBen, buXie, needleMoxa } from "./lessons/chapter8";
import { frozenShoulder, lowBack, neckShoulder, sciatica } from "./lessons/chapter9";
import { careTeam, neuropathicPain, parkinson } from "./lessons/chapter10";

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
    lessons: [pointTypes, boneProportion, locatingPractice],
  },
  {
    id: "c5",
    number: 5,
    title: "要穴",
    subtitle: "五兪穴・原穴・絡穴・郄穴・兪募穴・八会穴・下合穴",
    description: "特別な性質をもつ経穴の分類と、臨床での使い分け。",
    color: "#b45309",
    lessons: [fiveShu, yuanLuo, xiPoints, shuMu, huiHe],
  },
  {
    id: "c6",
    number: 6,
    title: "奇経八脈",
    subtitle: "循行・病候・八脈交会穴",
    description: "十二経脈を調節する8本の経絡と、八脈交会穴。",
    color: "#7a3e9d",
    lessons: [trunkVessels, limbVessels, confluentLesson],
  },
  {
    id: "c7",
    number: 7,
    title: "診察",
    subtitle: "四診・八綱・臓腑弁証・経絡弁証",
    description: "情報を集め、証を立てるまでの思考の流れ。",
    color: "#334155",
    lessons: [fourExams, eightPrinciples, zangfuPatterns, channelPatterns],
  },
  {
    id: "c8",
    number: 8,
    title: "治療",
    subtitle: "本治・標治・補瀉・鍼灸の使い分け",
    description: "証から治則・配穴・手技を組み立てる。",
    color: "#155e75",
    lessons: [biaoBen, buXie, needleMoxa],
  },
  {
    id: "c9",
    number: 9,
    title: "臨床",
    subtitle: "頸肩部痛・腰痛・坐骨神経痛・五十肩など",
    description: "よくみる運動器症状への評価と鍼灸の組み立て。",
    color: "#9a3412",
    lessons: [neckShoulder, lowBack, sciatica, frozenShoulder],
  },
  {
    id: "c10",
    number: 10,
    title: "専門",
    subtitle: "神経障害性疼痛・パーキンソン病などの神経難病",
    description: "医師と連携しながら鍼灸が担う役割を学ぶ。",
    color: "#3f3f46",
    lessons: [neuropathicPain, parkinson, careTeam],
  },
];

export const allLessons: Lesson[] = chapters.flatMap((c) => c.lessons);
export const lessonMap = Object.fromEntries(allLessons.map((l) => [l.id, l])) as Record<string, Lesson>;
export const chapterMap = Object.fromEntries(chapters.map((c) => [c.id, c])) as Record<string, Chapter>;
export const publishedLessons = allLessons.filter((l) => l.status === "published");

/** 最初に学ぶ講義 */
export const firstLesson = publishedLessons[0];
