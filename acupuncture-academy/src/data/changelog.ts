/**
 * 教材の更新履歴と、講義ごとの版。
 *
 * 教材を直したら：
 * 1. lessonRevisions の該当講義の revision を1つ上げ、updatedAt と note を書き換える
 * 2. changelog の先頭に、その日の更新内容を追加する
 * 3. contentVersion を更新日にする
 * すると、学習済みの人には講義画面とホームに「更新あり」が表示される。
 */

/** 教材データ全体の版（最終更新日） */
export const contentVersion = "2026-11-26";

export interface ChangeEntry {
  date: string;
  title: string;
  items: string[];
  /** 内容が変わった講義（「更新あり」の表示に使う） */
  lessonIds?: string[];
  /** 関連する画面 */
  links?: { href: string; label: string }[];
}

/** 新しい順 */
export const changelog: ChangeEntry[] = [
  {
    date: "2026-11-26",
    title: "「症状から取穴」と子午流注の講義を追加",
    items: [
      "症状を検索して、危険徴候の確認 → 部位から経絡 → 所見から証 → 局所・遠隔・背景の取穴候補と根拠を組み立てる「症状から取穴」を追加（14の症状）",
      "第8章第4講「子午流注」を追加。刻を押すと経脈と納支法の補瀉の穴がわかる時計の図つき",
      "経穴辞典に頻用穴14穴（百会・大椎・肩髃・承山・血海など）を追加",
    ],
    links: [
      { href: "/symptoms", label: "症状から取穴" },
      { href: "/lessons/c8-l4", label: "子午流注" },
    ],
  },
  {
    date: "2026-11-26",
    title: "要穴を全面拡充、経穴数の基準を追記",
    items: [
      "経穴辞典に十四経の要穴をすべて収録（五兪穴・原穴・絡穴・郄穴・背部兪穴・募穴・八会穴・下合穴・八脈交会穴・四総穴）",
      "「要穴一覧」の画面を追加。表の経穴から辞典の各ページへ移動できる",
      "辞典の要穴分類は一覧表から自動で作る方式に変更（表と辞典の食い違いをなくした）",
      "第4章第1講：WHO 標準361穴の経緯（1989年の所属決定、2006年の部位統一、日本の354穴からの変更）を追記",
      "第5章：五兪穴・原穴・郄穴・兪募穴・八会穴・下合穴の図を一覧表のデータから描くように変更し、要穴一覧への案内を追加",
    ],
    lessonIds: ["c4-l1", "c5-l1", "c5-l2", "c5-l3", "c5-l4", "c5-l5"],
    links: [
      { href: "/key-points", label: "要穴一覧" },
      { href: "/points", label: "経穴辞典" },
    ],
  },
  {
    date: "2026-11-25",
    title: "第4〜10章を公開（全10章37講）",
    items: ["経穴学・要穴・奇経八脈・診察・治療・臨床・専門の25講を追加", "図解を23種追加", "症例演習へ誘導する臨床の講義を追加"],
  },
  {
    date: "2026-11-21",
    title: "第1〜3章を公開、症例演習を追加",
    items: ["「経絡とは何か」を第1章第1講へ移動", "第1〜3章の12講を公開", "経穴辞典に要穴・頻用穴を追加、症例演習を4例に"],
  },
  {
    date: "2026-11-20",
    title: "鍼灸臨床アカデミーを公開",
    items: ["ダッシュボード・カリキュラム・経絡マップ・経穴辞典・八脈交会穴・症例演習・学習記録"],
  },
];

/** 講義ごとの版。記載のない講義は第1版 */
export const lessonRevisions: Record<string, { revision: number; updatedAt: string; note: string }> = {
  "c4-l1": { revision: 2, updatedAt: "2026-11-26", note: "WHO 標準361穴の経緯（1989年・2006年・日本の354穴からの変更）を追記" },
  "c5-l1": { revision: 2, updatedAt: "2026-11-26", note: "五兪穴の全経一覧（図）と要穴一覧への案内を追加" },
  "c5-l2": { revision: 2, updatedAt: "2026-11-26", note: "原穴・郄穴の図を一覧表のデータから描くように変更" },
  "c5-l3": { revision: 2, updatedAt: "2026-11-26", note: "郄穴の図を一覧表のデータから描くように変更" },
  "c5-l4": { revision: 2, updatedAt: "2026-11-26", note: "兪募穴の図を一覧表のデータから描くように変更" },
  "c5-l5": { revision: 2, updatedAt: "2026-11-26", note: "八会穴・下合穴の図を一覧表のデータから描くように変更" },
};

/** 講義を公開した日（第1版の日付） */
const publishedOn = (lessonId: string) => {
  const ch = Number(lessonId.match(/^c(\d+)/)?.[1] ?? 0);
  if (lessonId === "c1-l1") return "2026-11-20";
  if (lessonId === "c8-l4") return "2026-11-26";
  if (ch <= 3) return "2026-11-21";
  return "2026-11-25";
};

export function lessonRevision(lessonId: string) {
  return lessonRevisions[lessonId] ?? { revision: 1, updatedAt: publishedOn(lessonId), note: "初版" };
}
