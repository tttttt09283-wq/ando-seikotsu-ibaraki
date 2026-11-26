/**
 * 教材データの型定義。
 * 方針：すべての医学的記述に「出典（sourceIds）」と「監修状態（reviewStatus）」を持たせ、
 * 伝統理論・現代医学・臨床研究を区別して保持する。
 */

/** 監修状態。初期データはすべて unverified（要確認）。 */
export type ReviewStatus = "unverified" | "in-review" | "verified";

/** 記述の区分。画面上で必ず区別して表示する。 */
export type KnowledgeKind = "traditional" | "modern" | "research";

export interface Source {
  id: string;
  title: string;
  publisher?: string;
  year?: string;
  note?: string;
  /** 本アプリで原典との照合を済ませたか */
  checked: boolean;
}

export interface Reviewed {
  reviewStatus: ReviewStatus;
  sourceIds: string[];
}

// ---------- 経絡 ----------
export type MeridianId = "LU" | "LI" | "ST" | "SP" | "HT" | "SI" | "BL" | "KI" | "PC" | "TE" | "GB" | "LR";
/** 経穴が所属する経（十二経脈＋任脈・督脈＝十四経） */
export type PointChannel = MeridianId | "CV" | "GV";
export type ExtraVesselId = "GV" | "CV" | "TV" | "BV" | "YangLink" | "YinLink" | "YangHeel" | "YinHeel";
export type View = "front" | "back" | "side";

export interface Meridian extends Reviewed {
  id: MeridianId;
  /** 例：手の太陰肺経 */
  name: string;
  short: string;
  limb: "手" | "足";
  yinYang: "陰" | "陽";
  /** 太陰・陽明など */
  channel: string;
  organ: string;
  /** 表裏関係にある経絡 */
  pair: MeridianId;
  /** 流注の次の経絡 */
  next: MeridianId;
  pointCount: number;
  start: { code: string; name: string };
  end: { code: string; name: string };
  /** 流注の要約（伝統理論） */
  flow: string[];
  /** 次の経絡へつながる部位 */
  connection: string;
  /** 是動病・所生病などの病候の要約（伝統理論） */
  symptoms: string[];
  color: string;
}

export interface ExtraVessel extends Reviewed {
  id: ExtraVesselId;
  name: string;
  reading: string;
  course: string;
  symptoms: string[];
  color: string;
}

// ---------- 経穴 ----------
export type PointCategory =
  | "五兪穴"
  | "原穴"
  | "絡穴"
  | "郄穴"
  | "背部兪穴"
  | "募穴"
  | "八会穴"
  | "下合穴"
  | "八脈交会穴"
  | "四総穴"
  | "交会穴";

export interface ClaimItem {
  text: string;
  kind: KnowledgeKind;
  reviewStatus: ReviewStatus;
  sourceIds: string[];
}

export interface AcuPoint extends Reviewed {
  code: string; // WHO 標準コード 例: PC6
  name: string;
  reading: string;
  meridian: PointChannel;
  /** full：作用・主治・局所解剖まで記載／brief：名称・部位・分類・安全のみ（詳細は準備中） */
  detail: "full" | "brief";
  categories: { category: PointCategory; detail: string }[];
  /** 八脈交会穴で通じる奇経 */
  extraVessel?: ExtraVesselId;
  location: string;
  howToLocate: string[];
  anatomy: { label: string; text: string }[];
  /** 伝統的な作用 */
  actions: string[];
  indications: ClaimItem[];
  related: { code: string; name: string; reason: string }[];
  combinations: { points: string; purpose: string; kind: KnowledgeKind }[];
  safety: string[];
}

// ---------- 講義 ----------
export type LessonStepId = "explain" | "figure" | "clinical" | "quiz" | "review";

export interface QuizQuestion {
  id: string;
  prompt: string;
  /** 単一選択 or 複数選択 */
  type: "single" | "multiple";
  options: { id: string; text: string }[];
  answer: string[];
  explanation: string;
  /** 苦手分析用のタグ（理論名） */
  topic: string;
  /** 関連経穴（間違えた経穴の記録に使う） */
  pointCodes?: string[];
}

export interface ContentBlock {
  type: "text" | "keypoint" | "caution" | "list" | "figure" | "compare" | "link";
  /** link 用の移動先 */
  href?: string;
  title?: string;
  body?: string;
  items?: string[];
  figureId?: string;
  caption?: string;
  /** compare 用 */
  columns?: { heading: string; items: string[] }[];
}

export interface ClinicalExample {
  title: string;
  fictionalNotice: string;
  presentation: string[];
  redFlagCheck: string[];
  reasoning: { step: string; detail: string }[];
  takeaway: string;
}

export interface FlashCard {
  front: string;
  back: string;
}

export interface Lesson extends Reviewed {
  id: string;
  chapterId: string;
  number: number;
  title: string;
  summary: string;
  minutes: number;
  status: "published" | "planned";
  objectives?: string[];
  explain?: ContentBlock[];
  figures?: ContentBlock[];
  clinical?: ClinicalExample;
  quiz?: QuizQuestion[];
  review?: { keyPoints: string[]; cards: FlashCard[] };
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  lessons: Lesson[];
}

// ---------- 症例 ----------
export type CaseStepId = "redflag" | "differential" | "meridian" | "pattern" | "principle" | "points" | "evaluation";

export interface CaseStep {
  id: CaseStepId;
  title: string;
  question: string;
  type: "single" | "multiple";
  options: { id: string; text: string; rationale: string }[];
  answer: string[];
  explanation: string;
}

export interface ClinicalCase extends Reviewed {
  id: string;
  title: string;
  level: "基礎" | "応用" | "専門";
  chapterId: string;
  profile: string;
  findings: { label: string; text: string }[];
  steps: CaseStep[];
  summary: string;
}
