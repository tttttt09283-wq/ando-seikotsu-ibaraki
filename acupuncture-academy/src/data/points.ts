import type { AcuPoint, ClaimItem } from "./types";
import { keyPoints } from "./points-key";

/**
 * 経穴辞典：八脈交会穴 8穴（要穴・頻用穴は points-key.ts）。
 * 部位は WHO 標準経穴部位（2008）と国内教科書の記載に準拠することを目標に作成。
 * 監修者による原典照合が済むまで reviewStatus は unverified（画面に「要確認」と表示）。
 */

const LOC = ["who2008", "jp-textbook-points"];
const SRC = [...LOC, "anatomy-general"];

const trad = (text: string): ClaimItem => ({ text, kind: "traditional", reviewStatus: "unverified", sourceIds: ["jp-textbook-points"] });
const modern = (text: string, sourceIds: string[] = ["app-original"]): ClaimItem => ({ text, kind: "modern", reviewStatus: "unverified", sourceIds });

const confluentPoints: AcuPoint[] = [
  {
    code: "SI3",
    name: "後渓",
    reading: "こうけい",
    meridian: "SI",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [
      { category: "五兪穴", detail: "兪穴（木穴）" },
      { category: "八脈交会穴", detail: "督脈に通じる" },
    ],
    extraVessel: "GV",
    location: "手背、第5中手指節関節の尺側近位の陥凹部、赤白肉際。",
    howToLocate: [
      "軽く手を握り、小指の付け根（第5中手指節関節）の手首側を探る",
      "手のひらにできる横じわ（手掌遠位皮線）の尺側端のあたりで、皮膚の色が変わる境目（赤白肉際）の陥凹に取る",
    ],
    anatomy: [
      { label: "筋", text: "小指外転筋" },
      { label: "神経", text: "尺骨神経の手背枝・固有掌側指神経（領域）" },
      { label: "血管", text: "背側指動脈・静脈" },
    ],
    actions: ["督脈を通じさせる", "頸項・腰背の気血の巡りをよくする", "熱を冷ます（清熱）"],
    indications: [
      trad("頭痛・項部のこわばり"),
      trad("腰背部の痛み"),
      trad("耳鳴・目の充血"),
      trad("手指のしびれ・痛み"),
      trad("熱病"),
      modern("頸部痛・腰痛など筋骨格系の疼痛に用いられることが多い（臨床的な使用状況の記述であり、効果の証明ではない）"),
    ],
    related: [
      { code: "BL62", name: "申脈", reason: "八脈交会穴の組（督脈＋陽蹻脈）" },
      { code: "SI1", name: "少沢", reason: "同経の井穴" },
    ],
    combinations: [
      { points: "後渓＋申脈", purpose: "目内眥・頸項・耳・肩甲・背腰部の症状", kind: "traditional" },
      { points: "後渓＋天柱（局所）", purpose: "項部のこわばり（遠隔穴＋局所穴の例）", kind: "traditional" },
    ],
    safety: ["手の皮膚は感覚が鋭く刺激感が強い。浅く・やさしい刺激から始める", "腱・骨膜を強く刺激しない"],
  },
  {
    code: "BL62",
    name: "申脈",
    reading: "しんみゃく",
    meridian: "BL",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [{ category: "八脈交会穴", detail: "陽蹻脈に通じる" }],
    extraVessel: "YangHeel",
    location: "足外側、外果尖の直下、外果下縁と踵骨の間の陥凹部。",
    howToLocate: ["外くるぶしの最も高い点（外果尖）から真下に指をすべらせる", "外果の下縁と踵骨の間にできる陥凹に取る"],
    anatomy: [
      { label: "腱", text: "長腓骨筋腱・短腓骨筋腱" },
      { label: "神経", text: "腓腹神経（外側足背皮神経）" },
      { label: "血管", text: "外果動脈網" },
    ],
    actions: ["陽蹻脈を通じさせる", "心神を安定させる（安神）", "経絡の巡りをよくし痛みを止める"],
    indications: [
      trad("頭痛・めまい"),
      trad("不眠"),
      trad("腰・下肢の痛み"),
      trad("癲癇（てんかん）"),
      trad("外果周囲の腫れ・痛み"),
    ],
    related: [
      { code: "SI3", name: "後渓", reason: "八脈交会穴の組（督脈＋陽蹻脈）" },
      { code: "KI6", name: "照海", reason: "陰蹻脈の起点。陰陽の蹻脈として対で学ぶ" },
    ],
    combinations: [
      { points: "申脈＋後渓", purpose: "頸項・背腰部の症状", kind: "traditional" },
      { points: "申脈＋照海", purpose: "陰陽の蹻脈を調え、睡眠リズムの乱れに用いる例", kind: "traditional" },
    ],
    safety: ["腓骨筋腱に近いため深刺しない", "足関節捻挫の急性期など局所の炎症が強いときは局所刺激を控える"],
  },
  {
    code: "TE5",
    name: "外関",
    reading: "がいかん",
    meridian: "TE",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [
      { category: "絡穴", detail: "手の厥陰心包経へ絡う" },
      { category: "八脈交会穴", detail: "陽維脈に通じる" },
    ],
    extraVessel: "YangLink",
    location: "前腕後面、橈骨と尺骨の骨間の中点、手関節背側横紋の上方2寸。",
    howToLocate: ["手の甲側の手首のしわ（手関節背側横紋）の中央を確認する", "そこから肘に向かって2寸、橈骨と尺骨の間の中央に取る（内関の裏側にあたる）"],
    anatomy: [
      { label: "筋", text: "総指伸筋・小指伸筋の間、深部に長母指伸筋・示指伸筋" },
      { label: "神経", text: "後前腕皮神経、深部に後骨間神経" },
      { label: "血管", text: "後骨間動脈・静脈" },
    ],
    actions: ["表邪を除く（解表）", "熱を冷ます（清熱）", "少陽経の巡りをよくする"],
    indications: [
      trad("感冒初期の発熱・悪寒"),
      trad("側頭部の頭痛"),
      trad("耳鳴・難聴"),
      trad("目の充血・痛み"),
      trad("脇肋部の痛み"),
      trad("上肢の痛み・しびれ"),
    ],
    related: [
      { code: "GB41", name: "足臨泣", reason: "八脈交会穴の組（陽維脈＋帯脈）" },
      { code: "PC6", name: "内関", reason: "表裏経の絡穴同士。前腕で表裏の位置関係にある" },
    ],
    combinations: [
      { points: "外関＋足臨泣", purpose: "目外眥・耳後・頬・頸・肩の症状", kind: "traditional" },
      { points: "外関＋風池", purpose: "感冒初期の頭痛（例）", kind: "traditional" },
    ],
    safety: ["深部に後骨間神経・血管がある。響きが強すぎる場合は刺入を浅くする"],
  },
  {
    code: "GB41",
    name: "足臨泣",
    reading: "あしりんきゅう",
    meridian: "GB",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [
      { category: "五兪穴", detail: "兪穴（木穴）" },
      { category: "八脈交会穴", detail: "帯脈に通じる" },
    ],
    extraVessel: "BV",
    location: "足背、第4・第5中足骨底接合部の遠位、第5趾の長趾伸筋腱外側の陥凹部。",
    howToLocate: [
      "第4趾と第5趾の間から足首に向かって指をすべらせ、2本の中足骨が合わさる手前で止まるところを探す",
      "小趾に向かう長趾伸筋腱の外側の陥凹に取る（足趾を背屈すると腱が分かりやすい）",
    ],
    anatomy: [
      { label: "筋・腱", text: "第5趾への長趾伸筋腱の外側、第4背側骨間筋" },
      { label: "神経", text: "中間足背皮神経" },
      { label: "血管", text: "足背静脈網、第4背側中足動脈" },
    ],
    actions: ["肝胆の気の巡りをよくする（疏肝利胆）", "帯脈を調える", "目・耳の症状を改善する（伝統的表現）"],
    indications: [
      trad("側頭部の頭痛"),
      trad("目の痛み・充血"),
      trad("脇肋部の痛み"),
      trad("乳房の張り・痛み"),
      trad("月経の不調"),
      trad("足背の腫れ・痛み"),
    ],
    related: [
      { code: "TE5", name: "外関", reason: "八脈交会穴の組（陽維脈＋帯脈）" },
      { code: "GB40", name: "丘墟", reason: "同経の原穴（近位にある）" },
    ],
    combinations: [
      { points: "足臨泣＋外関", purpose: "目外眥・耳後・頬・頸・肩の症状", kind: "traditional" },
    ],
    safety: ["足背の皮下は薄く血管が多い。刺入時の出血・内出血に注意", "糖尿病などで足の感覚低下・循環障害がある人は感染予防に特に配慮し、施術の可否を慎重に判断する"],
  },
  {
    code: "LU7",
    name: "列欠",
    reading: "れっけつ",
    meridian: "LU",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [
      { category: "絡穴", detail: "手の陽明大腸経へ絡う" },
      { category: "八脈交会穴", detail: "任脈に通じる" },
      { category: "四総穴", detail: "「頭項は列欠に尋ぬ」" },
    ],
    extraVessel: "CV",
    location: "前腕橈側、長母指外転筋腱と短母指伸筋腱の間、長母指外転筋腱溝の中、手関節掌側横紋の上方1寸5分。",
    howToLocate: [
      "両手の母指と示指の間（虎口）を交差させ、示指を相手の橈骨茎状突起の上に置いたとき、示指の先端が当たる陥凹に取る方法が伝承される（簡便法）",
      "正式には手関節掌側横紋から1寸5分、橈骨茎状突起の上方の腱の間の溝で確認する",
    ],
    anatomy: [
      { label: "腱", text: "長母指外転筋腱・短母指伸筋腱、腕橈骨筋腱" },
      { label: "神経", text: "外側前腕皮神経、橈骨神経浅枝" },
      { label: "血管", text: "橈側皮静脈、橈骨動脈の枝" },
    ],
    actions: ["肺気の巡りを調える（宣肺）", "表邪を除く（解表）", "経絡を通じさせ頭項部の症状に用いる"],
    indications: [trad("頭痛・項部のこわばり"), trad("咳・喘鳴"), trad("咽喉の痛み"), trad("歯痛"), trad("顔面の麻痺（口眼歪斜）")],
    related: [
      { code: "KI6", name: "照海", reason: "八脈交会穴の組（任脈＋陰蹻脈）" },
      { code: "LI4", name: "合谷", reason: "表裏経の原穴。原絡配穴の例" },
    ],
    combinations: [
      { points: "列欠＋照海", purpose: "肺系・咽喉・胸膈の症状", kind: "traditional" },
      { points: "列欠＋合谷", purpose: "原絡配穴（表裏経）の例", kind: "traditional" },
    ],
    safety: ["皮下が薄く骨・腱が近い。斜刺・浅刺が基本", "橈骨神経浅枝・橈側皮静脈に近いので、電撃様の痛みが出たら抜き戻す"],
  },
  {
    code: "KI6",
    name: "照海",
    reading: "しょうかい",
    meridian: "KI",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [{ category: "八脈交会穴", detail: "陰蹻脈に通じる" }],
    extraVessel: "YinHeel",
    location: "足内側、内果尖の下方1寸、内果下方の陥凹部。",
    howToLocate: ["内くるぶしの最も高い点（内果尖）を確認する", "その真下1寸の陥凹に取る"],
    anatomy: [
      { label: "腱・筋", text: "後脛骨筋腱（後方）、母趾外転筋（下方）" },
      { label: "神経", text: "伏在神経の枝（皮膚）、深部後方に脛骨神経" },
      { label: "血管", text: "後脛骨動脈・静脈（後方）" },
    ],
    actions: ["腎陰を補う（滋陰）", "咽喉を潤す（利咽）", "心神を安定させる（安神）", "陰蹻脈を調える"],
    indications: [trad("咽喉の乾燥・痛み"), trad("不眠"), trad("月経不順・帯下"), trad("頻尿"), trad("便秘")],
    related: [
      { code: "LU7", name: "列欠", reason: "八脈交会穴の組（任脈＋陰蹻脈）" },
      { code: "BL62", name: "申脈", reason: "陽蹻脈の起点。陰陽の蹻脈として対で学ぶ" },
    ],
    combinations: [
      { points: "照海＋列欠", purpose: "肺系・咽喉・胸膈の症状", kind: "traditional" },
      { points: "照海＋申脈", purpose: "陰陽の蹻脈を調え、睡眠リズムの乱れに用いる例", kind: "traditional" },
    ],
    safety: ["後方に後脛骨動脈・脛骨神経が走る。刺入方向を後方へ向けない", "妊娠中の下腹部・下肢の刺激については所属機関の指針に従う（要確認）"],
  },
  {
    code: "PC6",
    name: "内関",
    reading: "ないかん",
    meridian: "PC",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [
      { category: "絡穴", detail: "手の少陽三焦経へ絡う" },
      { category: "八脈交会穴", detail: "陰維脈に通じる" },
    ],
    extraVessel: "YinLink",
    location: "前腕前面、長掌筋腱と橈側手根屈筋腱の間、手関節掌側横紋の上方2寸。",
    howToLocate: [
      "手を握って手首を軽く曲げ、手首中央に浮き出る2本の腱（長掌筋腱・橈側手根屈筋腱）を確認する",
      "手関節掌側横紋から2寸上、2本の腱の間に取る（長掌筋腱がない人もいる）",
    ],
    anatomy: [
      { label: "腱・筋", text: "長掌筋腱と橈側手根屈筋腱の間、深部に浅指屈筋・深指屈筋・方形回内筋" },
      { label: "神経", text: "内側・外側前腕皮神経、深部に正中神経" },
      { label: "血管", text: "前腕正中皮静脈、深部に前骨間動脈" },
    ],
    actions: ["心神を安定させる（寧心安神）", "胸の気を巡らせる（寛胸理気）", "胃の働きを調え嘔気を止める（和胃降逆）"],
    indications: [
      trad("胸の痛み・胸苦しさ"),
      trad("動悸"),
      trad("胃痛・悪心・嘔吐"),
      trad("不眠"),
      trad("肘・前腕の痛み"),
      modern("悪心・嘔吐（術後・化学療法など）の補助的ケアとして研究されている部位（PC6/P6）", ["cochrane-pc6-2015"]),
      {
        text: "術後悪心・嘔吐の予防について、PC6刺激の系統的レビューがある（効果の大きさ・確実性は原著で確認すること）",
        kind: "research",
        reviewStatus: "unverified",
        sourceIds: ["cochrane-pc6-2015"],
      },
    ],
    related: [
      { code: "SP4", name: "公孫", reason: "八脈交会穴の組（陰維脈＋衝脈）" },
      { code: "TE5", name: "外関", reason: "表裏経の絡穴同士。前腕で表裏の位置関係にある" },
    ],
    combinations: [
      { points: "内関＋公孫", purpose: "心・胸・胃の症状", kind: "traditional" },
      { points: "内関＋足三里", purpose: "胃の不調・悪心（例）", kind: "traditional" },
    ],
    safety: [
      "深部に正中神経がある。電撃様の痛みやしびれが走ったら直ちに抜き戻し、強い雀啄をしない",
      "胸痛・動悸を訴える患者では、心疾患などの医学的評価を優先する（鍼灸だけで対応しない）",
    ],
  },
  {
    code: "SP4",
    name: "公孫",
    reading: "こうそん",
    meridian: "SP",
    reviewStatus: "unverified",
    sourceIds: SRC,
    categories: [
      { category: "絡穴", detail: "足の陽明胃経へ絡う" },
      { category: "八脈交会穴", detail: "衝脈に通じる" },
    ],
    extraVessel: "TV",
    location: "足内側、第1中足骨底の前下方、赤白肉際。",
    howToLocate: ["母趾の付け根から足首側へ、足の内側縁（足底と足背の皮膚の境目＝赤白肉際）をなでる", "第1中足骨底の膨らみに指が当たる手前（前下方）の陥凹に取る"],
    anatomy: [
      { label: "筋", text: "母趾外転筋" },
      { label: "神経", text: "伏在神経の枝、内側足底神経の枝" },
      { label: "血管", text: "内側足根動脈、足背静脈網" },
    ],
    actions: ["脾胃の働きを調える（健脾和胃）", "衝脈を調える", "気の上逆を鎮める"],
    indications: [trad("胃痛"), trad("嘔吐"), trad("腹痛・腹部膨満"), trad("下痢"), trad("月経の不調（衝脈）")],
    related: [
      { code: "PC6", name: "内関", reason: "八脈交会穴の組（陰維脈＋衝脈）" },
      { code: "ST42", name: "衝陽", reason: "表裏経の原穴。原絡配穴の例" },
    ],
    combinations: [
      { points: "公孫＋内関", purpose: "心・胸・胃の症状", kind: "traditional" },
      { points: "公孫＋中脘", purpose: "胃の不調（遠隔穴＋局所穴の例）", kind: "traditional" },
    ],
    safety: ["足底側は刺激痛が強い。浅刺・弱刺激から始める", "足部の皮膚状態（傷・感染・感覚低下）を事前に確認する"],
  },
];

/** 辞典の全経穴（八脈交会穴 8穴 ＋ 要穴・頻用穴） */
export const points: AcuPoint[] = [...confluentPoints, ...keyPoints];

export const pointMap = Object.fromEntries(points.map((p) => [p.code, p])) as Record<string, AcuPoint>;
