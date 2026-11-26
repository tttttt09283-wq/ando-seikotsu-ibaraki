/**
 * 要穴データ（分類表と、辞典の簡易エントリ）。
 *
 * ・分類表（五兪穴・原穴・絡穴・郄穴・背部兪穴・募穴・八会穴・下合穴・四総穴）は、
 *   国内教科書（経絡経穴概論）と『霊枢』『難経』などの古典の記載に基づく一般的な配当。
 * ・経穴辞典の「分類」は、この表から自動で作る。表と辞典の内容は必ず一致する。
 * ・部位は WHO/WPRO 標準経穴部位（2008、日本語公式版 2009）の表現を目標に要約した。
 *   原典との逐語照合は未了のため、すべて「要確認」として表示する。
 */
import type { MeridianId, PointCategory, PointChannel } from "./types";
import { confluentPairs } from "./eight-confluent";

/** 経穴コードから所属経を取り出す（例：LU11 → LU、CV12 → CV） */
export function channelOfCode(code: string): PointChannel {
  return code.replace(/\d+$/, "") as PointChannel;
}

// ---------------------------------------------------------------------------
// 分類表
// ---------------------------------------------------------------------------

export const SHU_NAMES = ["井", "滎", "兪", "経", "合"] as const;
export const YIN_ELEMENTS = ["木", "火", "土", "金", "水"] as const;
export const YANG_ELEMENTS = ["金", "水", "木", "火", "土"] as const;

/** 五兪穴（井・滎・兪・経・合）。流注の順に並べる */
export const fiveShuTable: { meridian: MeridianId; codes: [string, string, string, string, string] }[] = [
  { meridian: "LU", codes: ["LU11", "LU10", "LU9", "LU8", "LU5"] },
  { meridian: "LI", codes: ["LI1", "LI2", "LI3", "LI5", "LI11"] },
  { meridian: "ST", codes: ["ST45", "ST44", "ST43", "ST41", "ST36"] },
  { meridian: "SP", codes: ["SP1", "SP2", "SP3", "SP5", "SP9"] },
  { meridian: "HT", codes: ["HT9", "HT8", "HT7", "HT4", "HT3"] },
  { meridian: "SI", codes: ["SI1", "SI2", "SI3", "SI5", "SI8"] },
  { meridian: "BL", codes: ["BL67", "BL66", "BL65", "BL60", "BL40"] },
  { meridian: "KI", codes: ["KI1", "KI2", "KI3", "KI7", "KI10"] },
  { meridian: "PC", codes: ["PC9", "PC8", "PC7", "PC5", "PC3"] },
  { meridian: "TE", codes: ["TE1", "TE2", "TE3", "TE6", "TE10"] },
  { meridian: "GB", codes: ["GB44", "GB43", "GB41", "GB38", "GB34"] },
  { meridian: "LR", codes: ["LR1", "LR2", "LR3", "LR4", "LR8"] },
];

/** 原穴・絡穴・郄穴（十二経） */
export const yuanLuoXiTable: { meridian: MeridianId; yuan: string; luo: string; xi: string }[] = [
  { meridian: "LU", yuan: "LU9", luo: "LU7", xi: "LU6" },
  { meridian: "LI", yuan: "LI4", luo: "LI6", xi: "LI7" },
  { meridian: "ST", yuan: "ST42", luo: "ST40", xi: "ST34" },
  { meridian: "SP", yuan: "SP3", luo: "SP4", xi: "SP8" },
  { meridian: "HT", yuan: "HT7", luo: "HT5", xi: "HT6" },
  { meridian: "SI", yuan: "SI4", luo: "SI7", xi: "SI6" },
  { meridian: "BL", yuan: "BL64", luo: "BL58", xi: "BL63" },
  { meridian: "KI", yuan: "KI3", luo: "KI4", xi: "KI5" },
  { meridian: "PC", yuan: "PC7", luo: "PC6", xi: "PC4" },
  { meridian: "TE", yuan: "TE4", luo: "TE5", xi: "TE7" },
  { meridian: "GB", yuan: "GB40", luo: "GB37", xi: "GB36" },
  { meridian: "LR", yuan: "LR3", luo: "LR5", xi: "LR6" },
];

/** 十五絡穴のうち十二経以外の3穴 */
export const extraLuo: { code: string; label: string }[] = [
  { code: "CV15", label: "任脈の絡穴" },
  { code: "GV1", label: "督脈の絡穴" },
  { code: "SP21", label: "脾の大絡" },
];

/** 郄穴のうち奇経の4穴 */
export const extraXi: { code: string; vessel: string }[] = [
  { code: "KI8", vessel: "陰蹻脈" },
  { code: "BL59", vessel: "陽蹻脈" },
  { code: "KI9", vessel: "陰維脈" },
  { code: "GB35", vessel: "陽維脈" },
];

/** 背部兪穴・募穴（十二臓腑） */
export const shuMuTable: { organ: string; shu: string; level: string; mu: string }[] = [
  { organ: "肺", shu: "BL13", level: "T3", mu: "LU1" },
  { organ: "心包", shu: "BL14", level: "T4", mu: "CV17" },
  { organ: "心", shu: "BL15", level: "T5", mu: "CV14" },
  { organ: "肝", shu: "BL18", level: "T9", mu: "LR14" },
  { organ: "胆", shu: "BL19", level: "T10", mu: "GB24" },
  { organ: "脾", shu: "BL20", level: "T11", mu: "LR13" },
  { organ: "胃", shu: "BL21", level: "T12", mu: "CV12" },
  { organ: "三焦", shu: "BL22", level: "L1", mu: "CV5" },
  { organ: "腎", shu: "BL23", level: "L2", mu: "GB25" },
  { organ: "大腸", shu: "BL25", level: "L4", mu: "ST25" },
  { organ: "小腸", shu: "BL27", level: "S1", mu: "CV4" },
  { organ: "膀胱", shu: "BL28", level: "S2", mu: "CV3" },
];

/** 八会穴（『難経』四十五難） */
export const huiTable: { tissue: string; code: string }[] = [
  { tissue: "臓", code: "LR13" },
  { tissue: "腑", code: "CV12" },
  { tissue: "気", code: "CV17" },
  { tissue: "血", code: "BL17" },
  { tissue: "筋", code: "GB34" },
  { tissue: "脈", code: "LU9" },
  { tissue: "骨", code: "BL11" },
  { tissue: "髄", code: "GB39" },
];

/** 下合穴（『霊枢』邪気臓腑病形篇「合は内府を治す」） */
export const lowerHeTable: { fu: string; code: string }[] = [
  { fu: "胃", code: "ST36" },
  { fu: "大腸", code: "ST37" },
  { fu: "小腸", code: "ST39" },
  { fu: "胆", code: "GB34" },
  { fu: "膀胱", code: "BL40" },
  { fu: "三焦", code: "BL39" },
];

/** 四総穴（『鍼灸聚英』四総穴歌の内容として伝わるもの） */
export const sizongTable: { code: string; phrase: string; region: string }[] = [
  { code: "ST36", phrase: "肚腹は三里に留む", region: "腹部" },
  { code: "BL40", phrase: "腰背は委中に求む", region: "腰背部" },
  { code: "LU7", phrase: "頭項は列欠に尋ぬ", region: "頭部・項部" },
  { code: "LI4", phrase: "面口は合谷に収む", region: "顔面・口" },
];

const organOf: Record<MeridianId, string> = {
  LU: "肺経",
  LI: "大腸経",
  ST: "胃経",
  SP: "脾経",
  HT: "心経",
  SI: "小腸経",
  BL: "膀胱経",
  KI: "腎経",
  PC: "心包経",
  TE: "三焦経",
  GB: "胆経",
  LR: "肝経",
};
const yinMeridians: MeridianId[] = ["LU", "SP", "HT", "KI", "PC", "LR"];

/** 表から経穴ごとの要穴分類を作る */
export function derivedCategories(code: string): { category: PointCategory; detail: string }[] {
  const out: { category: PointCategory; detail: string }[] = [];
  for (const row of fiveShuTable) {
    const i = row.codes.indexOf(code);
    if (i >= 0) {
      const el = (yinMeridians.includes(row.meridian) ? YIN_ELEMENTS : YANG_ELEMENTS)[i];
      out.push({ category: "五兪穴", detail: `${SHU_NAMES[i]}穴（${el}穴）` });
    }
  }
  for (const row of yuanLuoXiTable) {
    if (row.yuan === code) out.push({ category: "原穴", detail: `${organOf[row.meridian]}の原穴` });
    if (row.luo === code) out.push({ category: "絡穴", detail: `${organOf[row.meridian]}の絡穴` });
    if (row.xi === code) out.push({ category: "郄穴", detail: `${organOf[row.meridian]}の郄穴` });
  }
  for (const r of extraLuo) if (r.code === code) out.push({ category: "絡穴", detail: r.label });
  for (const r of extraXi) if (r.code === code) out.push({ category: "郄穴", detail: `${r.vessel}の郄穴` });
  for (const r of shuMuTable) {
    if (r.shu === code) out.push({ category: "背部兪穴", detail: `${r.organ}の背部兪穴` });
    if (r.mu === code) out.push({ category: "募穴", detail: `${r.organ}の募穴` });
  }
  for (const r of huiTable) if (r.code === code) out.push({ category: "八会穴", detail: `${r.tissue}会` });
  for (const r of lowerHeTable) if (r.code === code) out.push({ category: "下合穴", detail: `${r.fu}の下合穴` });
  for (const p of confluentPairs) {
    for (const half of [p.upper, p.lower]) {
      if (half.code === code) out.push({ category: "八脈交会穴", detail: `${vesselName[half.vessel]}に通じる` });
    }
  }
  for (const r of sizongTable) if (r.code === code) out.push({ category: "四総穴", detail: `「${r.phrase}」` });
  return out;
}

const vesselName: Record<string, string> = {
  GV: "督脈",
  CV: "任脈",
  TV: "衝脈",
  BV: "帯脈",
  YangLink: "陽維脈",
  YinLink: "陰維脈",
  YangHeel: "陽蹻脈",
  YinHeel: "陰蹻脈",
};

/** 表に出てくるすべての経穴コード */
export function allTableCodes(): string[] {
  const set = new Set<string>();
  fiveShuTable.forEach((r) => r.codes.forEach((c) => set.add(c)));
  yuanLuoXiTable.forEach((r) => [r.yuan, r.luo, r.xi].forEach((c) => set.add(c)));
  extraLuo.forEach((r) => set.add(r.code));
  extraXi.forEach((r) => set.add(r.code));
  shuMuTable.forEach((r) => [r.shu, r.mu].forEach((c) => set.add(c)));
  huiTable.forEach((r) => set.add(r.code));
  lowerHeTable.forEach((r) => set.add(r.code));
  sizongTable.forEach((r) => set.add(r.code));
  confluentPairs.forEach((p) => [p.upper.code, p.lower.code].forEach((c) => set.add(c)));
  return [...set];
}

// ---------------------------------------------------------------------------
// 経穴辞典の簡易エントリ（名称・よみ・部位・安全上の注意）
// 作用・主治・局所解剖の詳しい記載は、監修体制が整いしだい順次追加する。
// ---------------------------------------------------------------------------

export interface BriefPoint {
  code: string;
  name: string;
  reading: string;
  location: string;
  safety?: string[];
}

const LUNG = "深部に肺がある。深刺・内方への刺入は気胸のリスクがあるため、浅刺とし方向に注意する";
const ABDOMEN = "腹腔内臓器がある。深刺しない。腹部の強い痛み・発熱などがあれば急性腹症を考え受診を優先する";
const NAIL = "爪の際で刺激痛が強い。刺絡を行う場合は衛生管理と出血傾向（抗凝固薬など）の確認が必須";

export const briefPoints: BriefPoint[] = [
  // 肺経
  { code: "LU1", name: "中府", reading: "ちゅうふ", location: "前胸部、第1肋間と同じ高さ、鎖骨下窩の外側、前正中線の外方6寸。", safety: [LUNG] },
  { code: "LU5", name: "尺沢", reading: "しゃくたく", location: "肘前部、肘窩横紋上、上腕二頭筋腱外方の陥凹部。" },
  { code: "LU6", name: "孔最", reading: "こうさい", location: "前腕前外側、尺沢と太淵を結ぶ線上、手関節掌側横紋の上方7寸。" },
  { code: "LU8", name: "経渠", reading: "けいきょ", location: "前腕前外側、橈骨下端の橈側で最も突出した部位と橈骨動脈の間、手関節掌側横紋の上方1寸。", safety: ["橈骨動脈が近い。拍動を確認して避ける"] },
  { code: "LU10", name: "魚際", reading: "ぎょさい", location: "手掌、第1中手骨中点の橈側、赤白肉際。" },
  { code: "LU11", name: "少商", reading: "しょうしょう", location: "母指、末節骨橈側、爪甲角の近位外方0.1寸（指寸）。", safety: [NAIL] },
  // 大腸経
  { code: "LI1", name: "商陽", reading: "しょうよう", location: "示指、末節骨橈側、爪甲角の近位外方0.1寸（指寸）。", safety: [NAIL] },
  { code: "LI2", name: "二間", reading: "じかん", location: "示指、第2中手指節関節橈側の遠位陥凹部、赤白肉際。" },
  { code: "LI3", name: "三間", reading: "さんかん", location: "手背、第2中手指節関節橈側の近位陥凹部。" },
  { code: "LI5", name: "陽渓", reading: "ようけい", location: "手関節後外側、手関節背側横紋橈側、橈骨茎状突起の遠位、タバコ窩（解剖学的嗅ぎタバコ窩）の陥凹部。" },
  { code: "LI6", name: "偏歴", reading: "へんれき", location: "前腕後外側、陽渓と曲池を結ぶ線上、手関節背側横紋の上方3寸。" },
  { code: "LI7", name: "温溜", reading: "おんる", location: "前腕後外側、陽渓と曲池を結ぶ線上、手関節背側横紋の上方5寸。" },
  // 胃経
  { code: "ST34", name: "梁丘", reading: "りょうきゅう", location: "大腿前外側、外側広筋と大腿直筋腱外縁の間、膝蓋骨底の上方2寸。" },
  { code: "ST37", name: "上巨虚", reading: "じょうこきょ", location: "下腿前面、犢鼻と解渓を結ぶ線上、犢鼻の下方6寸。" },
  { code: "ST39", name: "下巨虚", reading: "げこきょ", location: "下腿前面、犢鼻と解渓を結ぶ線上、犢鼻の下方9寸。" },
  { code: "ST40", name: "豊隆", reading: "ほうりゅう", location: "下腿前外側、前脛骨筋の外縁、外果尖の上方8寸。" },
  { code: "ST41", name: "解渓", reading: "かいけい", location: "足関節前面、足関節前面中央の陥凹部、長母趾伸筋腱と長趾伸筋腱の間。" },
  { code: "ST42", name: "衝陽", reading: "しょうよう", location: "足背、第2中足骨底部と中間楔状骨の間、足背動脈拍動部。", safety: ["足背動脈の拍動部。動脈を避けて刺入する"] },
  { code: "ST43", name: "陥谷", reading: "かんこく", location: "足背、第2・第3中足骨間、第2中足指節関節の近位陥凹部。" },
  { code: "ST44", name: "内庭", reading: "ないてい", location: "足背、第2・第3趾間、みずかきの近位、赤白肉際。" },
  { code: "ST45", name: "厲兌", reading: "れいだ", location: "足の第2趾、末節骨外側、爪甲角の近位外方0.1寸（指寸）。", safety: [NAIL] },
  // 脾経
  { code: "SP1", name: "隠白", reading: "いんぱく", location: "足の第1趾、末節骨内側、爪甲角の近位内方0.1寸（指寸）。", safety: [NAIL] },
  { code: "SP2", name: "大都", reading: "だいと", location: "足の第1趾、第1中足指節関節の遠位陥凹部、赤白肉際。" },
  { code: "SP3", name: "太白", reading: "たいはく", location: "足内側、第1中足指節関節の近位陥凹部、赤白肉際。" },
  { code: "SP5", name: "商丘", reading: "しょうきゅう", location: "足内側、内果の前下方、舟状骨粗面と内果尖の中央陥凹部。" },
  { code: "SP8", name: "地機", reading: "ちき", location: "下腿内側、脛骨内縁の後際、陰陵泉の下方3寸。" },
  { code: "SP9", name: "陰陵泉", reading: "いんりょうせん", location: "下腿内側、脛骨内側顆下縁と脛骨内縁が接する陥凹部。" },
  { code: "SP21", name: "大包", reading: "だいほう", location: "側胸部、第6肋間、中腋窩線上。", safety: [LUNG] },
  // 心経
  { code: "HT3", name: "少海", reading: "しょうかい", location: "肘前内側、上腕骨内側上顆の前縁、肘窩横紋と同じ高さ。" },
  { code: "HT4", name: "霊道", reading: "れいどう", location: "前腕前内側、尺側手根屈筋腱の橈側縁、手関節掌側横紋の上方1寸5分。", safety: ["尺骨神経・尺骨動脈が近い"] },
  { code: "HT5", name: "通里", reading: "つうり", location: "前腕前内側、尺側手根屈筋腱の橈側縁、手関節掌側横紋の上方1寸。", safety: ["尺骨神経・尺骨動脈が近い"] },
  { code: "HT6", name: "陰郄", reading: "いんげき", location: "前腕前内側、尺側手根屈筋腱の橈側縁、手関節掌側横紋の上方5分。", safety: ["尺骨神経・尺骨動脈が近い"] },
  { code: "HT7", name: "神門", reading: "しんもん", location: "手関節前内側、尺側手根屈筋腱の橈側縁、手関節掌側横紋上。", safety: ["尺骨神経・尺骨動脈が近い"] },
  { code: "HT8", name: "少府", reading: "しょうふ", location: "手掌、第5中手指節関節の近位端と同じ高さ、第4・第5中手骨の間。" },
  { code: "HT9", name: "少衝", reading: "しょうしょう", location: "小指、末節骨橈側、爪甲角の近位外方0.1寸（指寸）。", safety: [NAIL] },
  // 小腸経
  { code: "SI1", name: "少沢", reading: "しょうたく", location: "小指、末節骨尺側、爪甲角の近位内方0.1寸（指寸）。", safety: [NAIL] },
  { code: "SI2", name: "前谷", reading: "ぜんこく", location: "小指、第5中手指節関節尺側の遠位陥凹部、赤白肉際。" },
  { code: "SI4", name: "腕骨", reading: "わんこつ", location: "手関節後内側、第5中手骨底部と三角骨の間の陥凹部、赤白肉際。" },
  { code: "SI5", name: "陽谷", reading: "ようこく", location: "手関節後内側、三角骨と尺骨茎状突起の間の陥凹部。" },
  { code: "SI6", name: "養老", reading: "ようろう", location: "前腕後内側、尺骨頭橈側の陥凹部、手関節背側横紋の上方1寸。" },
  { code: "SI7", name: "支正", reading: "しせい", location: "前腕後内側、尺骨内縁と尺側手根屈筋の間、手関節背側横紋の上方5寸。" },
  { code: "SI8", name: "小海", reading: "しょうかい", location: "肘後内側、肘頭と上腕骨内側上顆の間の陥凹部。", safety: ["尺骨神経溝の上。尺骨神経を強く刺激しない"] },
  // 膀胱経
  { code: "BL11", name: "大杼", reading: "だいじょ", location: "上背部、第1胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL13", name: "肺兪", reading: "はいゆ", location: "上背部、第3胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL14", name: "厥陰兪", reading: "けついんゆ", location: "上背部、第4胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL15", name: "心兪", reading: "しんゆ", location: "上背部、第5胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL17", name: "膈兪", reading: "かくゆ", location: "上背部、第7胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL18", name: "肝兪", reading: "かんゆ", location: "上背部、第9胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL19", name: "胆兪", reading: "たんゆ", location: "上背部、第10胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL20", name: "脾兪", reading: "ひゆ", location: "上背部、第11胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: [LUNG] },
  { code: "BL21", name: "胃兪", reading: "いゆ", location: "上背部、第12胸椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: ["深部に腎臓・肺の下端がある。深刺しない"] },
  { code: "BL22", name: "三焦兪", reading: "さんしょうゆ", location: "腰部、第1腰椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。", safety: ["深部に腎臓がある。深刺しない"] },
  { code: "BL25", name: "大腸兪", reading: "だいちょうゆ", location: "腰部、第4腰椎棘突起下縁と同じ高さ、後正中線の外方1寸5分。" },
  { code: "BL27", name: "小腸兪", reading: "しょうちょうゆ", location: "仙骨部、第1後仙骨孔と同じ高さ、正中仙骨稜の外方1寸5分。" },
  { code: "BL28", name: "膀胱兪", reading: "ぼうこうゆ", location: "仙骨部、第2後仙骨孔と同じ高さ、正中仙骨稜の外方1寸5分。" },
  { code: "BL39", name: "委陽", reading: "いよう", location: "膝後外側、大腿二頭筋腱の内縁、膝窩横紋上。", safety: ["総腓骨神経が近い。しびれが走ったら抜き戻す"] },
  { code: "BL58", name: "飛揚", reading: "ひよう", location: "下腿後外側、腓腹筋外側頭下縁とアキレス腱の間、崑崙の上方7寸。" },
  { code: "BL59", name: "跗陽", reading: "ふよう", location: "下腿後外側、腓骨とアキレス腱の間、崑崙の上方3寸。" },
  { code: "BL60", name: "崑崙", reading: "こんろん", location: "足関節後外側、外果尖とアキレス腱の間の陥凹部。", safety: ["妊娠中の刺激は避けるべきとする伝統的な記載がある（要確認）"] },
  { code: "BL63", name: "金門", reading: "きんもん", location: "足背、外果前縁の遠位、第5中足骨粗面の後方、立方骨下方の陥凹部。" },
  { code: "BL64", name: "京骨", reading: "けいこつ", location: "足外側、第5中足骨粗面の遠位、赤白肉際。" },
  { code: "BL65", name: "束骨", reading: "そっこつ", location: "足外側、第5中足指節関節の近位陥凹部、赤白肉際。" },
  { code: "BL66", name: "足通谷", reading: "あしつうこく", location: "足の第5趾、第5中足指節関節の遠位外側陥凹部、赤白肉際。" },
  { code: "BL67", name: "至陰", reading: "しいん", location: "足の第5趾、末節骨外側、爪甲角の近位外方0.1寸（指寸）。", safety: [NAIL] },
  // 腎経
  { code: "KI1", name: "湧泉", reading: "ゆうせん", location: "足底、足趾を屈曲したとき、足底の最陥凹部。", safety: ["足底は刺激痛が強い。皮膚の状態・感覚低下を確認する"] },
  { code: "KI2", name: "然谷", reading: "ねんこく", location: "足内側、舟状骨粗面の下方、赤白肉際。" },
  { code: "KI4", name: "大鐘", reading: "だいしょう", location: "足内側、内果後下方、踵骨上方、アキレス腱付着部内側前方の陥凹部。", safety: ["後脛骨動脈・脛骨神経が近い"] },
  { code: "KI5", name: "水泉", reading: "すいせん", location: "足内側、太渓の下方1寸、踵骨隆起前方の陥凹部。" },
  { code: "KI7", name: "復溜", reading: "ふくりゅう", location: "下腿後内側、アキレス腱の前縁、内果尖の上方2寸。" },
  { code: "KI8", name: "交信", reading: "こうしん", location: "下腿内側、脛骨内縁の後方の陥凹部、内果尖の上方2寸。" },
  { code: "KI9", name: "築賓", reading: "ちくひん", location: "下腿後内側、ヒラメ筋とアキレス腱の間、内果尖の上方5寸。" },
  { code: "KI10", name: "陰谷", reading: "いんこく", location: "膝後内側、半腱様筋腱の外縁、膝窩横紋上。", safety: ["膝窩動静脈・脛骨神経が近い。深刺しない"] },
  // 心包経
  { code: "PC3", name: "曲沢", reading: "きょくたく", location: "肘前面、肘窩横紋上、上腕二頭筋腱内方の陥凹部。", safety: ["上腕動脈・正中神経が近い"] },
  { code: "PC4", name: "郄門", reading: "げきもん", location: "前腕前面、長掌筋腱と橈側手根屈筋腱の間、手関節掌側横紋の上方5寸。", safety: ["深部に正中神経がある"] },
  { code: "PC5", name: "間使", reading: "かんし", location: "前腕前面、長掌筋腱と橈側手根屈筋腱の間、手関節掌側横紋の上方3寸。", safety: ["深部に正中神経がある"] },
  { code: "PC7", name: "大陵", reading: "だいりょう", location: "手関節前面、長掌筋腱と橈側手根屈筋腱の間、手関節掌側横紋上。", safety: ["正中神経（手根管の入口付近）が近い"] },
  { code: "PC8", name: "労宮", reading: "ろうきゅう", location: "手掌、第2・第3中手骨間、中手指節関節の近位陥凹部（WHO 標準。第3・第4中手骨間とする別説があり、部位の議論があった経穴）。" },
  { code: "PC9", name: "中衝", reading: "ちゅうしょう", location: "中指、中指先端中央（WHO 標準。中指橈側の爪甲角とする別説がある）。", safety: [NAIL] },
  // 三焦経
  { code: "TE1", name: "関衝", reading: "かんしょう", location: "薬指、末節骨尺側、爪甲角の近位内方0.1寸（指寸）。", safety: [NAIL] },
  { code: "TE2", name: "液門", reading: "えきもん", location: "手背、第4・第5指間、みずかきの近位、赤白肉際。" },
  { code: "TE3", name: "中渚", reading: "ちゅうしょ", location: "手背、第4・第5中手骨間、第4中手指節関節の近位陥凹部。" },
  { code: "TE4", name: "陽池", reading: "ようち", location: "手関節後面、総指伸筋腱の尺側陥凹部、手関節背側横紋上。" },
  { code: "TE6", name: "支溝", reading: "しこう", location: "前腕後面、橈骨と尺骨の骨間の中点、手関節背側横紋の上方3寸。" },
  { code: "TE7", name: "会宗", reading: "えそう", location: "前腕後面、尺骨の橈側縁、手関節背側横紋の上方3寸。" },
  { code: "TE10", name: "天井", reading: "てんせい", location: "肘後面、肘頭の上方1寸、陥凹部。" },
  // 胆経
  { code: "GB24", name: "日月", reading: "じつげつ", location: "前胸部、第7肋間、前正中線の外方4寸。", safety: [LUNG, "右側は深部に肝臓・胆のうがある"] },
  { code: "GB25", name: "京門", reading: "けいもん", location: "側腹部、第12肋骨端下縁。", safety: ["深部に腎臓などがある。深刺しない"] },
  { code: "GB35", name: "陽交", reading: "ようこう", location: "下腿外側、腓骨の後方、外果尖の上方7寸。" },
  { code: "GB36", name: "外丘", reading: "がいきゅう", location: "下腿外側、腓骨の前方、外果尖の上方7寸。" },
  { code: "GB37", name: "光明", reading: "こうめい", location: "下腿外側、腓骨の前方、外果尖の上方5寸。" },
  { code: "GB38", name: "陽輔", reading: "ようほ", location: "下腿外側、腓骨の前方、外果尖の上方4寸。" },
  { code: "GB39", name: "懸鐘", reading: "けんしょう", location: "下腿外側、腓骨の前方、外果尖の上方3寸（別名：絶骨）。" },
  { code: "GB40", name: "丘墟", reading: "きゅうきょ", location: "足関節前外側、長趾伸筋腱外側の陥凹部、外果の遠位。" },
  { code: "GB43", name: "侠渓", reading: "きょうけい", location: "足背、第4・第5趾間、みずかきの近位、赤白肉際。" },
  { code: "GB44", name: "足竅陰", reading: "あしきょういん", location: "足の第4趾、末節骨外側、爪甲角の近位外方0.1寸（指寸）。", safety: [NAIL] },
  // 肝経
  { code: "LR1", name: "大敦", reading: "だいとん", location: "足の第1趾、末節骨外側、爪甲角の近位外方0.1寸（指寸）。", safety: [NAIL] },
  { code: "LR2", name: "行間", reading: "こうかん", location: "足背、第1・第2趾間、みずかきの近位、赤白肉際。" },
  { code: "LR4", name: "中封", reading: "ちゅうほう", location: "足関節前内側、前脛骨筋腱内側の陥凹部、内果尖の前方。" },
  { code: "LR5", name: "蠡溝", reading: "れいこう", location: "下腿前内側、脛骨内側面の中央、内果尖の上方5寸。" },
  { code: "LR6", name: "中都", reading: "ちゅうと", location: "下腿前内側、脛骨内側面の中央、内果尖の上方7寸。" },
  { code: "LR8", name: "曲泉", reading: "きょくせん", location: "膝内側、半腱様筋腱・半膜様筋腱内側の陥凹部、膝窩横紋の内側端。" },
  { code: "LR13", name: "章門", reading: "しょうもん", location: "側腹部、第11肋骨端下縁。", safety: [ABDOMEN] },
  { code: "LR14", name: "期門", reading: "きもん", location: "前胸部、第6肋間、前正中線の外方4寸。", safety: [LUNG, "右側は深部に肝臓がある"] },
  // 任脈
  { code: "CV3", name: "中極", reading: "ちゅうきょく", location: "下腹部、前正中線上、臍中央の下方4寸。", safety: [ABDOMEN, "施術前に排尿を済ませてもらう（膀胱）"] },
  { code: "CV4", name: "関元", reading: "かんげん", location: "下腹部、前正中線上、臍中央の下方3寸。", safety: [ABDOMEN, "施術前に排尿を済ませてもらう（膀胱）"] },
  { code: "CV5", name: "石門", reading: "せきもん", location: "下腹部、前正中線上、臍中央の下方2寸。", safety: [ABDOMEN] },
  { code: "CV12", name: "中脘", reading: "ちゅうかん", location: "上腹部、前正中線上、臍中央の上方4寸。", safety: [ABDOMEN] },
  { code: "CV14", name: "巨闕", reading: "こけつ", location: "上腹部、前正中線上、臍中央の上方6寸。", safety: [ABDOMEN, "上方に向けて深く刺入しない（心臓・肝臓）"] },
  { code: "CV15", name: "鳩尾", reading: "きゅうび", location: "上腹部、前正中線上、胸骨体下端の下方1寸。", safety: ["上方に向けて深く刺入しない（心臓・肝臓）。剣状突起の形には個人差がある"] },
  { code: "CV17", name: "膻中", reading: "だんちゅう", location: "前胸部、前正中線上、第4肋間と同じ高さ。", safety: ["胸骨上で皮下が薄い。胸骨に孔（胸骨孔）がある人もいるため深刺しない"] },
  // 頻用穴（要穴ではないが、症状からの取穴でよく使う経穴）
  { code: "ST8", name: "頭維", reading: "ずい", location: "頭部、額角髪際の直上5分、前正中線の外方4寸5分。" },
  { code: "ST35", name: "犢鼻", reading: "とくび", location: "膝前面、膝蓋靱帯外方の陥凹部。", safety: ["関節腔に刺入しないよう、深さと方向に注意する。膝の腫れ・熱感があれば施術より受診を優先する"] },
  { code: "SP10", name: "血海", reading: "けっかい", location: "大腿前内側、内側広筋隆起部、膝蓋骨底内端の上方2寸。" },
  { code: "LI15", name: "肩髃", reading: "けんぐう", location: "肩周囲部、肩峰外縁の前端と上腕骨大結節の間の陥凹部。" },
  { code: "TE14", name: "肩髎", reading: "けんりょう", location: "肩周囲部、肩峰角と上腕骨大結節の間の陥凹部。" },
  { code: "SI9", name: "肩貞", reading: "けんてい", location: "肩周囲部、肩関節の後下方、腋窩横紋後端の上方1寸。", safety: ["深部に腋窩の神経・血管がある。腋窩方向へ深く刺入しない"] },
  { code: "SI11", name: "天宗", reading: "てんそう", location: "肩甲部、肩甲棘の中点と肩甲骨下角を結んだ線上、肩甲棘から3分の1にある陥凹部。", safety: ["肩甲骨上で比較的安全だが、肩甲骨の外側を越えて深刺すると胸腔に達するおそれがある"] },
  { code: "BL32", name: "次髎", reading: "じりょう", location: "仙骨部、第2後仙骨孔。" },
  { code: "BL57", name: "承山", reading: "しょうざん", location: "下腿後面、腓腹筋筋腹とアキレス腱の移行部。", safety: ["深部に脛骨神経・後脛骨動静脈がある。強い刺激はこむら返りを誘発することがある"] },
  { code: "GB8", name: "率谷", reading: "そっこく", location: "頭部、耳尖の直上、髪際の上方1寸5分。" },
  { code: "CV6", name: "気海", reading: "きかい", location: "下腹部、前正中線上、臍中央の下方1寸5分。", safety: [ABDOMEN] },
  { code: "GV4", name: "命門", reading: "めいもん", location: "腰部、後正中線上、第2腰椎棘突起下方の陥凹部。", safety: ["深部に脊髄（馬尾）がある。深刺しない"] },
  { code: "GV14", name: "大椎", reading: "だいつい", location: "後頸部、後正中線上、第7頸椎棘突起下方の陥凹部。", safety: ["深部に脊髄がある。深刺しない"] },
  { code: "GV20", name: "百会", reading: "ひゃくえ", location: "頭部、前正中線上、前髪際の後方5寸。", safety: ["頭皮は出血しやすい。抜鍼後に圧迫する"] },
  // 督脈
  { code: "GV1", name: "長強", reading: "ちょうきょう", location: "会陰部、尾骨の下方、尾骨端と肛門の中央。", safety: ["直腸に注意し、尾骨前面に沿って刺入する。羞恥心・プライバシーに配慮する"] },
];
