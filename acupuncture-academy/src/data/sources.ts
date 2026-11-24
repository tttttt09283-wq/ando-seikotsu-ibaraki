import type { Source } from "./types";

/**
 * 出典一覧。
 * checked=false は「本アプリの教材作成時に原典との逐語照合が未了」であることを示す。
 * 監修者が原典（版・ページ）を確認したら checked=true とし、note に版・頁を記入する。
 */
export const sources: Source[] = [
  {
    id: "who2008",
    title: "WHO Standard Acupuncture Point Locations in the Western Pacific Region",
    publisher: "World Health Organization, Western Pacific Region",
    year: "2008",
    note: "経穴の部位・コード表記の基準。日本語訳『WHO/WPRO標準経穴部位 日本語公式版』（医道の日本社）。版・頁の照合は未了。",
    checked: false,
  },
  {
    id: "jp-textbook-points",
    title: "新版 経絡経穴概論（第2版）",
    publisher: "東洋療法学校協会 編／教科書執筆小委員会 著（医道の日本社）",
    note: "国内養成校の標準教科書。取穴法・要穴分類の照合先。版・頁の照合は未了。",
    checked: false,
  },
  {
    id: "jp-textbook-basic",
    title: "新版 東洋医学概論",
    publisher: "東洋療法学校協会 編／教科書執筆小委員会 著（医道の日本社）",
    note: "経絡の概念・構成・流注の照合先。版・頁の照合は未了。",
    checked: false,
  },
  {
    id: "lingshu-jingmai",
    title: "『霊枢』経脈篇（第10）",
    note: "十二経脈の流注・是動病・所生病の古典的記載。現代語訳は教科書に準拠予定。",
    checked: false,
  },
  {
    id: "zhenjiu-daquan",
    title: "『鍼灸大全』（明・徐鳳）八法交会八穴",
    note: "八脈交会穴とその主治部位（例：公孫・内関＝心・胸・胃）の古典的記載。原文照合は未了。",
    checked: false,
  },
  {
    id: "cochrane-pc6-2015",
    title: "Lee A, Chan SKC, Fan LTY. Stimulation of the wrist acupuncture point PC6 for preventing postoperative nausea and vomiting. Cochrane Database Syst Rev. 2015;(11):CD003281.",
    note: "PC6刺激と術後悪心・嘔吐に関する系統的レビュー。結論の要約は原著で要確認。",
    checked: false,
  },
  {
    id: "anatomy-general",
    title: "局所解剖の一般的記載（解剖学教科書）",
    note: "経穴部位の局所解剖は解剖学教科書・経穴解剖書での照合が必要。個体差がある。",
    checked: false,
  },
  {
    id: "app-original",
    title: "本アプリ編集部による教育用構成（未監修）",
    note: "学習用に構成した説明・図解・架空症例。専門家の監修前の内容。",
    checked: false,
  },
];

export const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));
