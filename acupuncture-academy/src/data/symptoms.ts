/**
 * 症状からの取穴ガイド（教育用）。
 *
 * 「危険徴候の確認 → 部位から経絡 → 随伴所見から証 → 局所・遠隔・背景の配穴」という
 * 講義と同じ思考の順で、取穴の候補とその根拠を示す。
 * ・配穴は国内教科書・古典に見られる伝統的な配穴の考え方の例であり、処方や効果の保証ではない。
 * ・最終的な選穴・刺激量は、資格者が患者の状態・既往・服薬・同意を確認して決める。
 * ・監修前のため、すべて「要確認」として表示する。
 */
import type { ReviewStatus } from "./types";

export type PointRole = "局所" | "遠隔" | "背景";

export interface PointRec {
  code: string;
  reason: string;
}

export interface SymptomRegion {
  id: string;
  label: string;
  channels: string;
  local: PointRec[];
  distal: PointRec[];
}

export interface SymptomPattern {
  id: string;
  name: string;
  /** 該当する所見（チェックリストに使う） */
  signs: string[];
  principle: string;
  points: PointRec[];
  /** 灸・温める刺激が向くなどの補足 */
  method?: string;
}

export interface SymptomGuide {
  id: string;
  name: string;
  aliases: string[];
  group: "運動器" | "頭頸部" | "消化器" | "呼吸器" | "睡眠・こころ" | "婦人科" | "全身";
  redFlags: string[];
  regions?: SymptomRegion[];
  /** 部位に関係なく基本になる穴 */
  common: { role: PointRole; rec: PointRec }[];
  patterns: SymptomPattern[];
  evaluation: string[];
  cautions?: string[];
  lessonId?: string;
  caseId?: string;
  reviewStatus: ReviewStatus;
  sourceIds: string[];
}

const r = (code: string, reason: string): PointRec => ({ code, reason });
const SRC = ["jp-textbook-points", "jp-textbook-basic", "app-original"];
const base = { reviewStatus: "unverified" as const, sourceIds: SRC };

export const symptomGuides: SymptomGuide[] = [
  {
    ...base,
    id: "headache",
    name: "頭痛",
    aliases: ["頭が痛い", "偏頭痛", "片頭痛", "緊張型頭痛", "頭重", "こめかみ", "後頭部痛"],
    group: "頭頸部",
    lessonId: "c7-l4",
    redFlags: [
      "突然の、今までで最悪の頭痛",
      "発熱と項部の硬さ（首を前に曲げられない）",
      "手足の麻痺・しびれ、ろれつが回らない、視野の異常",
      "50歳以降に初めて起きた頭痛、日ごとに悪化する頭痛",
      "頭部の外傷後の頭痛",
    ],
    regions: [
      { id: "front", label: "前額部", channels: "陽明経（胃経・大腸経）", local: [r("ST8", "前額部の局所。胃経が額角に至る")], distal: [r("LI4", "手の陽明経の原穴。四総穴「面口は合谷に収む」"), r("ST44", "足の陽明経の滎穴。陽明経の熱に用いる例")] },
      { id: "temple", label: "側頭部", channels: "少陽経（胆経・三焦経）", local: [r("GB8", "側頭部の局所（胆経）"), r("GB20", "後頭下部の局所。胆経と陽維脈の交会")], distal: [r("TE5", "手の少陽経の絡穴。陽維脈に通じる"), r("GB41", "足の少陽経の兪穴。外関と組む八脈交会穴")] },
      { id: "occiput", label: "後頭部・項部", channels: "太陽経（膀胱経・小腸経）、督脈", local: [r("BL10", "項部の局所（膀胱経）"), r("GB20", "後頭下部の局所")], distal: [r("SI3", "手の太陽経の兪穴。督脈に通じる"), r("BL60", "足の太陽経の経穴。頭項の症状に用いる例")] },
      { id: "vertex", label: "頭頂部", channels: "厥陰経（肝経）、督脈", local: [r("GV20", "頭頂の局所（督脈）。肝経も体内で頭頂に至る")], distal: [r("LR3", "肝経の原穴")] },
    ],
    common: [],
    patterns: [
      { id: "liver-yang", name: "肝陽上亢", signs: ["イライラ・怒りっぽい", "顔が赤い・のぼせ", "めまい", "弦脈"], principle: "平肝潜陽（肝の高ぶりを鎮める）", points: [r("LR3", "肝経の原穴。肝の高ぶりを鎮める"), r("KI3", "腎経の原穴。陰を補い陽を抑える考え方")] },
      { id: "qi-blood-def", name: "気血不足", signs: ["疲れると悪化する", "顔色が白い・つやがない", "めまい・立ちくらみ", "淡舌"], principle: "益気養血（気血を補う）", points: [r("ST36", "胃経の合穴。気血を補う代表穴"), r("CV6", "気を補う局所（灸もよく用いる）")], method: "弱い刺激・灸など補う刺激を中心に" },
      { id: "wind-cold", name: "風寒（かぜの初期）", signs: ["寒気がする", "項部がこわばる", "鼻水が透明", "浮脈"], principle: "疏風散寒（表の寒を発散させる）", points: [r("GB20", "風邪を除く代表穴"), r("LU7", "四総穴「頭項は列欠に尋ぬ」。表証に用いる"), r("GV14", "諸陽経が会する穴。温める刺激も用いる")] },
      { id: "phlegm", name: "痰湿", signs: ["頭が重く締めつけられる", "めまい・吐き気", "体が重だるい", "膩苔（ねばった苔）"], principle: "化痰祛湿", points: [r("ST40", "胃経の絡穴。痰を除く代表穴"), r("CV12", "胃の募穴・腑会。脾胃を調える")] },
      { id: "stasis", name: "瘀血", signs: ["刺すような固定した痛み", "夜間に強い", "外傷・長期の頭痛歴", "舌の紫斑"], principle: "活血化瘀", points: [r("BL17", "八会穴の血会"), r("SP10", "血の巡りを調える例")] },
    ],
    evaluation: ["頭痛の強さ（NRS）と1か月の頭痛日数", "鎮痛薬を飲んだ日数", "生活・仕事への支障", "危険徴候の新たな出現"],
  },
  {
    ...base,
    id: "neck-shoulder",
    name: "頸肩部痛・肩こり",
    aliases: ["肩こり", "首のこり", "首の痛み", "寝違え", "肩甲間部", "首肩"],
    group: "運動器",
    lessonId: "c9-l1",
    caseId: "case-neck-01",
    redFlags: [
      "上肢の進行する筋力低下・しびれ、手の細かい動作のしにくさ・歩きにくさ（頸髄症）",
      "胸痛・息苦しさ・冷汗を伴う肩の痛み（心臓などの関連痛）",
      "発熱・体重減少・がんの既往",
      "外傷後の痛み",
    ],
    regions: [
      { id: "back", label: "後頸部〜肩甲間部", channels: "太陽経（膀胱経・小腸経）、督脈", local: [r("BL10", "項部の局所"), r("SI11", "肩甲骨部の局所（小腸経）")], distal: [r("SI3", "手の太陽経の兪穴。督脈に通じる"), r("BL62", "後渓と組む八脈交会穴（陽蹻脈）")] },
      { id: "side", label: "側頸部〜肩上部", channels: "少陽経（胆経・三焦経）", local: [r("GB20", "後頭下部の局所"), r("GB21", "肩上部の局所。直下に肺尖があり浅刺")], distal: [r("TE5", "手の少陽経の絡穴（陽維脈）"), r("GB41", "外関と組む八脈交会穴（帯脈）")] },
    ],
    common: [],
    patterns: [
      { id: "qi-stag", name: "肝気鬱結（気滞）", signs: ["ストレスで悪化", "ため息が多い", "張るような痛み", "弦脈"], principle: "疏肝理気", points: [r("LR3", "肝経の原穴。気の巡りを調える"), r("LI4", "太衝と組む「四関穴」の例")] },
      { id: "wind-cold", name: "風寒", signs: ["冷えると悪化", "朝のこわばり", "温めると楽"], principle: "祛風散寒・温経", points: [r("GV14", "温める刺激を用いる例"), r("GB20", "風邪を除く代表穴")], method: "温灸・温める刺激" },
      { id: "def", name: "気血不足", signs: ["疲れると悪化", "重だるい痛み", "顔色が悪い", "淡舌"], principle: "益気養血", points: [r("ST36", "気血を補う代表穴")], method: "弱い刺激から" },
      { id: "stasis", name: "瘀血", signs: ["刺すような固定痛", "夜間痛", "長く続いている"], principle: "活血通絡", points: [r("BL17", "血会")] },
    ],
    evaluation: ["痛み（NRS）", "頸部の可動域（回旋・側屈の角度、つっぱる位置）", "圧痛・硬結の部位", "神経症状の有無"],
    cautions: ["肩井・天柱・風池は深部に肺尖・延髄・椎骨動脈がある。刺入の深さと方向に注意する"],
  },
  {
    ...base,
    id: "low-back",
    name: "腰痛",
    aliases: ["腰が痛い", "ぎっくり腰", "急性腰痛", "慢性腰痛", "腰のだるさ"],
    group: "運動器",
    lessonId: "c9-l2",
    caseId: "case-lowback-01",
    redFlags: [
      "排尿・排便の障害、会陰部の感覚低下（馬尾症候群）",
      "進行する下肢の筋力低下",
      "発熱・体重減少・がんの既往",
      "高齢・骨粗鬆症・ステロイド使用者の軽い外傷後の痛み（圧迫骨折）",
      "安静でも続く痛み・夜間痛、腹部の拍動する痛み",
    ],
    regions: [
      { id: "para", label: "脊柱の両側", channels: "足の太陽膀胱経", local: [r("BL23", "腎の背部兪穴（腰部の局所）。深部に腎臓"), r("BL25", "大腸の背部兪穴（腰部の局所）")], distal: [r("BL40", "四総穴「腰背は委中に求む」"), r("BL60", "膀胱経の経穴")] },
      { id: "mid", label: "脊柱の正中", channels: "督脈", local: [r("GV4", "腰部正中の局所（督脈）。深刺しない")], distal: [r("SI3", "督脈に通じる八脈交会穴")] },
      { id: "side", label: "腰の側面", channels: "帯脈・足の少陽胆経", local: [r("GB25", "腎の募穴・側腹部の局所")], distal: [r("GB41", "帯脈に通じる八脈交会穴"), r("GB34", "胆経の合穴・筋会")] },
    ],
    common: [],
    patterns: [
      { id: "cold-damp", name: "寒湿", signs: ["冷え・雨の日に悪化", "重だるい", "温めると楽", "白膩苔"], principle: "散寒除湿・温経通絡", points: [r("BL23", "温灸を用いる例"), r("SP9", "脾経の合穴。湿を除く例")], method: "温灸・灸頭鍼など温める刺激" },
      { id: "stasis", name: "瘀血", signs: ["負荷・外傷のあとから", "刺すような固定痛", "夜間に強い", "舌の紫斑"], principle: "活血化瘀", points: [r("BL40", "膀胱経の合穴。瘀血の腰痛に用いる例"), r("BL17", "血会")] },
      { id: "kidney-def", name: "腎虚", signs: ["慢性のだるい痛み", "疲れると悪化", "腰膝に力が入らない", "夜間尿"], principle: "補腎壮腰", points: [r("BL23", "腎の背部兪穴"), r("KI3", "腎経の原穴（兪原配穴）")], method: "弱い刺激・灸" },
      { id: "qi-stag", name: "気滞", signs: ["ストレスで悪化", "張る痛み・場所が移る"], principle: "疏肝理気", points: [r("LR3", "肝経の原穴")] },
    ],
    evaluation: ["痛み（NRS）", "前屈の範囲（指床間距離）", "日常生活の支障（起床時・仕事）", "下肢症状・排尿排便の異常の有無"],
  },
  {
    ...base,
    id: "sciatica",
    name: "坐骨神経痛・下肢の痛みとしびれ",
    aliases: ["坐骨神経痛", "下肢痛", "足のしびれ", "お尻の痛み", "殿部痛", "ヘルニア", "脊柱管狭窄症"],
    group: "運動器",
    lessonId: "c9-l3",
    caseId: "case-sciatica-01",
    redFlags: [
      "排尿・排便の障害、会陰部の感覚低下（馬尾症候群）",
      "進行する筋力低下（足首が上がらない・つまずく）",
      "両側の下肢に症状が広がる",
      "足の色が悪い・冷たい・脈が弱い（末梢動脈疾患）",
      "発熱・体重減少・がんの既往",
    ],
    regions: [
      { id: "back", label: "殿部〜大腿後面〜下腿後面", channels: "足の太陽膀胱経", local: [r("BL25", "腰部の局所"), r("BL32", "仙骨部の局所")], distal: [r("BL40", "膀胱経の合穴"), r("BL57", "下腿後面"), r("BL60", "膀胱経の経穴")] },
      { id: "lateral", label: "殿部外側〜大腿外側〜下腿外側", channels: "足の少陽胆経", local: [r("GB30", "殿部の局所。深部に坐骨神経")], distal: [r("GB34", "胆経の合穴・筋会"), r("GB39", "髄会")] },
    ],
    common: [],
    patterns: [
      { id: "stasis", name: "気滞血瘀", signs: ["重い物を持った後など、きっかけがある", "刺すような痛み", "夜間も痛む", "舌が暗い・舌下静脈の怒張"], principle: "活血化瘀・通経止痛", points: [r("BL17", "血会"), r("BL40", "瘀血の痛みに用いる例")] },
      { id: "cold-damp", name: "寒湿", signs: ["冷えで悪化", "重だるい", "温めると楽"], principle: "散寒除湿", points: [r("BL23", "温灸を用いる例")], method: "温める刺激" },
      { id: "kidney-def", name: "腎虚", signs: ["高齢・慢性", "腰膝に力が入らない", "疲れると悪化"], principle: "補腎", points: [r("KI3", "腎経の原穴"), r("BL23", "腎の背部兪穴")] },
    ],
    evaluation: ["腰と下肢それぞれの痛み（NRS）", "SLR テストの角度", "感覚・筋力（足首・母趾の背屈）", "休まず歩ける距離"],
    cautions: ["神経に響く強い刺激を繰り返さない。しびれ・痛みが強まったら中止し、主治医に伝える"],
  },
  {
    ...base,
    id: "knee",
    name: "膝の痛み",
    aliases: ["膝痛", "変形性膝関節症", "膝が痛い", "階段で膝が痛い"],
    group: "運動器",
    redFlags: [
      "膝の強い腫れ・熱感・発赤、発熱（感染・痛風・関節炎）",
      "外傷後の痛み・不安定感・ロッキング（引っかかって動かない）",
      "片側のふくらはぎの腫れ・熱感（深部静脈血栓症）",
      "安静時・夜間の強い痛み",
    ],
    regions: [
      { id: "front", label: "膝の前面", channels: "足の陽明胃経", local: [r("ST35", "膝前面の局所。関節腔に入れない"), r("ST34", "胃経の郄穴。膝の上の局所")], distal: [r("ST36", "胃経の合穴")] },
      { id: "medial", label: "膝の内側", channels: "足の太陰脾経・厥陰肝経", local: [r("SP9", "脾経の合穴（膝内側の局所）"), r("LR8", "肝経の合穴（膝内側の局所）")], distal: [r("SP6", "足の三陰経の交会")] },
      { id: "lateral", label: "膝の外側", channels: "足の少陽胆経", local: [r("GB34", "胆経の合穴・筋会")], distal: [r("GB39", "髄会")] },
      { id: "back", label: "膝の裏", channels: "足の太陽膀胱経", local: [r("BL40", "膀胱経の合穴。深部に膝窩動静脈")], distal: [r("BL57", "下腿後面")] },
    ],
    common: [{ role: "局所", rec: r("SP10", "膝の上内側。血の巡りを調える例") }],
    patterns: [
      { id: "cold-damp", name: "寒湿", signs: ["冷えると痛む", "雨の日に悪化", "温めると楽"], principle: "散寒除湿・温経", points: [r("SP9", "湿を除く例")], method: "温灸" },
      { id: "kidney-def", name: "腎虚（肝腎不足）", signs: ["高齢・長く続く", "腰膝がだるい", "疲れると悪化"], principle: "補益肝腎", points: [r("KI3", "腎経の原穴"), r("BL23", "腎の背部兪穴")] },
      { id: "stasis", name: "瘀血", signs: ["外傷のあと", "刺すような固定痛", "夜間痛"], principle: "活血化瘀", points: [r("SP10", "血の巡りを調える例"), r("BL17", "血会")] },
    ],
    evaluation: ["痛み（NRS）", "歩ける距離・階段の昇り降り", "膝の曲げ伸ばしの角度", "腫れ・熱感の有無"],
  },
  {
    ...base,
    id: "shoulder",
    name: "肩の痛み・五十肩",
    aliases: ["五十肩", "四十肩", "肩関節周囲炎", "腕が上がらない", "肩が痛い"],
    group: "運動器",
    lessonId: "c9-l4",
    caseId: "case-shoulder-01",
    redFlags: ["外傷後に急に腕が上がらない（骨折・腱板断裂・脱臼）", "肩の強い熱感・腫れ・発熱（感染）", "胸痛・息苦しさを伴う（関連痛）", "がんの既往・体重減少"],
    regions: [
      { id: "front", label: "肩の前面", channels: "手の陽明大腸経・太陰肺経", local: [r("LI15", "肩前面の局所（大腸経）")], distal: [r("LI11", "大腸経の合穴"), r("LI4", "大腸経の原穴")] },
      { id: "lateral", label: "肩の外側", channels: "手の少陽三焦経", local: [r("TE14", "肩外側の局所（三焦経）")], distal: [r("TE5", "三焦経の絡穴")] },
      { id: "back", label: "肩の後面", channels: "手の太陽小腸経", local: [r("SI9", "肩後面の局所"), r("SI11", "肩甲骨部の局所")], distal: [r("SI3", "小腸経の兪穴")] },
    ],
    common: [],
    patterns: [
      { id: "wind-cold", name: "風寒湿（痹証）", signs: ["冷えると悪化", "温めると楽", "重だるい"], principle: "祛風散寒除湿", points: [r("GV14", "温める刺激を用いる例")], method: "温灸" },
      { id: "def", name: "気血不足", signs: ["疲れやすい", "中高年", "淡舌・細脈"], principle: "益気養血", points: [r("ST36", "気血を補う代表穴")] },
      { id: "stasis", name: "瘀血", signs: ["夜間痛が強い", "刺すような痛み", "長く続いている"], principle: "活血通絡", points: [r("BL17", "血会")] },
    ],
    evaluation: ["肩の可動域（屈曲・外転・外旋・結帯）", "夜間痛の回数", "痛み（NRS）", "髪を結ぶ・服の着脱などの動作"],
    cautions: ["炎症期（夜間痛が強い時期）は強い刺激や無理な他動運動を避ける"],
  },
  {
    ...base,
    id: "stomach",
    name: "胃痛・胃もたれ",
    aliases: ["胃が痛い", "胃もたれ", "胸やけ", "食欲不振", "みぞおち", "消化不良"],
    group: "消化器",
    lessonId: "c5-l4",
    redFlags: ["吐血・黒色便・貧血", "原因のはっきりしない体重減少", "飲み込みにくさ・繰り返す嘔吐", "胸痛・冷汗（心筋梗塞が胃痛に似ることがある）", "突然の激しい痛み・板のように硬い腹部"],
    common: [
      { role: "局所", rec: r("CV12", "胃の募穴・腑会") },
      { role: "局所", rec: r("BL21", "胃の背部兪穴（兪募配穴）") },
      { role: "遠隔", rec: r("ST36", "胃経の合穴・胃の下合穴。四総穴「肚腹は三里に留む」") },
      { role: "遠隔", rec: r("PC6", "公孫と組む八脈交会穴（心・胸・胃）") },
    ],
    patterns: [
      { id: "liver-stomach", name: "肝気犯胃", signs: ["ストレスで悪化", "げっぷ・ため息", "脇が張る", "弦脈"], principle: "疏肝和胃", points: [r("LR3", "肝経の原穴"), r("LR14", "肝の募穴")] },
      { id: "spleen-def", name: "脾胃虚弱", signs: ["食後のもたれ", "疲れやすい・軟便", "温かいものを好む", "淡舌・歯痕"], principle: "健脾益気", points: [r("BL20", "脾の背部兪穴"), r("SP4", "脾経の絡穴。内関と組む")], method: "弱い刺激・温灸" },
      { id: "food", name: "食滞（食べすぎ）", signs: ["食べすぎ・飲みすぎのあと", "酸っぱいげっぷ", "急な張る痛み", "厚い苔"], principle: "消食導滞", points: [r("ST34", "胃経の郄穴。急な胃の痛みに用いる例"), r("ST44", "胃経の滎穴")] },
    ],
    evaluation: ["症状の頻度・強さ", "食事量・食後の症状", "中脘・胃兪の圧痛", "危険徴候の有無"],
  },
  {
    ...base,
    id: "nausea",
    name: "悪心・吐き気",
    aliases: ["吐き気", "むかつき", "乗り物酔い", "つわり", "嘔吐"],
    group: "消化器",
    redFlags: ["激しい頭痛・神経症状を伴う", "激しい腹痛・お腹が張って排便・排ガスがない（腸閉塞）", "吐血・コーヒー残渣様の嘔吐", "脱水（尿が少ない・ぐったり）", "妊娠の可能性（医療機関での確認を）"],
    common: [
      { role: "遠隔", rec: r("PC6", "悪心・嘔吐に伝統的に用いられ、術後悪心嘔吐の予防について系統的レビューがある部位（効果の大きさは原著で要確認）") },
      { role: "遠隔", rec: r("ST36", "胃の下合穴") },
      { role: "局所", rec: r("CV12", "胃の募穴") },
    ],
    patterns: [
      { id: "liver-stomach", name: "肝気犯胃", signs: ["ストレス・緊張で悪化", "げっぷ", "弦脈"], principle: "疏肝和胃降逆", points: [r("LR3", "肝経の原穴")] },
      { id: "spleen-def", name: "脾胃虚弱", signs: ["食欲がない", "疲れやすい", "淡舌"], principle: "健脾和胃", points: [r("SP4", "脾経の絡穴。内関と組む八脈交会穴")] },
    ],
    evaluation: ["吐き気の強さ・回数", "食事・水分がとれているか", "危険徴候の有無"],
    cautions: ["妊娠中のつわりへの施術は、産科の受診状況を確認し、所属機関の指針に従う"],
  },
  {
    ...base,
    id: "constipation",
    name: "便秘",
    aliases: ["便が出ない", "便秘症", "お腹が張る"],
    group: "消化器",
    redFlags: ["血便・黒色便", "原因のはっきりしない体重減少", "中高年での急な排便習慣の変化", "腹痛・嘔吐を伴い排ガスがない（腸閉塞）"],
    common: [
      { role: "局所", rec: r("ST25", "大腸の募穴") },
      { role: "局所", rec: r("BL25", "大腸の背部兪穴（兪募配穴）") },
      { role: "遠隔", rec: r("ST37", "大腸の下合穴") },
      { role: "遠隔", rec: r("TE6", "三焦経の経穴。便秘に伝統的に用いられる例") },
    ],
    patterns: [
      { id: "heat", name: "熱秘", signs: ["便が硬く乾く", "口が渇く・口臭", "顔が赤い", "黄苔"], principle: "清熱潤腸", points: [r("LI4", "大腸経の原穴"), r("ST44", "胃経の滎穴")] },
      { id: "qi", name: "気秘", signs: ["ストレスで悪化", "げっぷ・お腹の張り", "便意はあるが出にくい"], principle: "順気導滞", points: [r("LR3", "肝経の原穴")] },
      { id: "def", name: "虚秘", signs: ["いきむ力が弱い", "疲れやすい", "便は硬くない"], principle: "益気潤腸", points: [r("ST36", "気を補う"), r("CV6", "気を補う局所"), r("BL20", "脾の背部兪穴")] },
      { id: "cold", name: "冷秘", signs: ["冷えで悪化", "お腹が冷たい", "高齢"], principle: "温陽通便", points: [r("CV4", "温灸を用いる例"), r("BL23", "腎の背部兪穴")], method: "温灸" },
    ],
    evaluation: ["排便の回数・便の形", "腹部の張り", "下剤の使用回数", "危険徴候の有無"],
  },
  {
    ...base,
    id: "diarrhea",
    name: "下痢・軟便",
    aliases: ["下痢", "軟便", "お腹がゆるい", "過敏性腸症候群"],
    group: "消化器",
    redFlags: ["血便", "高熱・強い腹痛", "脱水（尿が少ない・ぐったり）", "原因のはっきりしない体重減少", "夜間に起きるほどの下痢"],
    common: [
      { role: "局所", rec: r("ST25", "大腸の募穴") },
      { role: "遠隔", rec: r("ST37", "大腸の下合穴") },
      { role: "遠隔", rec: r("ST36", "胃の下合穴") },
    ],
    patterns: [
      { id: "spleen-def", name: "脾虚", signs: ["食後に下痢しやすい", "疲れやすい", "淡舌・歯痕"], principle: "健脾止瀉", points: [r("BL20", "脾の背部兪穴"), r("SP9", "湿を除く例")], method: "温灸" },
      { id: "kidney-yang", name: "腎陽虚（明け方の下痢）", signs: ["明け方に下痢をする", "腰や足の冷え", "高齢"], principle: "温腎健脾", points: [r("BL23", "腎の背部兪穴"), r("CV4", "温灸を用いる例"), r("GV4", "温める刺激を用いる例")], method: "温灸" },
      { id: "liver-spleen", name: "肝脾不和", signs: ["ストレス・緊張で下痢", "腹痛が排便で楽になる"], principle: "疏肝健脾", points: [r("LR3", "肝経の原穴")] },
    ],
    evaluation: ["排便回数・便の形", "腹痛の有無", "水分摂取・脱水の徴候"],
  },
  {
    ...base,
    id: "insomnia",
    name: "不眠",
    aliases: ["眠れない", "寝つけない", "夜中に目が覚める", "睡眠障害", "早朝覚醒"],
    group: "睡眠・こころ",
    lessonId: "c6-l2",
    redFlags: ["2週間以上続く気分の落ち込み・興味の喪失・死にたい気持ち", "大きないびき・呼吸の停止の指摘・日中の強い眠気（睡眠時無呼吸症候群）", "新しく始めた薬・カフェイン・飲酒", "痛み・かゆみ・頻尿など眠りを妨げる身体症状"],
    common: [
      { role: "遠隔", rec: r("HT7", "心経の原穴。心神を安定させる代表穴") },
      { role: "遠隔", rec: r("SP6", "足の三陰経の交会") },
      { role: "遠隔", rec: r("BL62", "陽蹻脈。照海と組んで陰陽の蹻脈を調える例") },
      { role: "遠隔", rec: r("KI6", "陰蹻脈。申脈と組む例") },
    ],
    patterns: [
      { id: "heart-spleen", name: "心脾両虚", signs: ["夢が多く眠りが浅い", "動悸", "疲れやすい・食欲がない", "淡舌"], principle: "補益心脾", points: [r("BL15", "心の背部兪穴"), r("BL20", "脾の背部兪穴"), r("ST36", "気血を補う")] },
      { id: "yin-def", name: "陰虚火旺（心腎不交）", signs: ["寝つけない・ほてる", "寝汗", "口が乾く", "紅舌・少苔"], principle: "滋陰降火・交通心腎", points: [r("KI3", "腎経の原穴"), r("KI6", "陰を補う")] },
      { id: "liver-fire", name: "肝火", signs: ["イライラして眠れない", "顔が赤い・口が苦い", "弦脈"], principle: "清肝瀉火", points: [r("LR2", "肝経の滎穴（火穴）。肝実に瀉す穴（母子補瀉）"), r("LR3", "肝経の原穴")] },
      { id: "phlegm-heat", name: "痰熱", signs: ["胸がつかえる", "痰が多い・吐き気", "黄膩苔"], principle: "清熱化痰", points: [r("ST40", "痰を除く代表穴"), r("ST44", "胃経の滎穴")] },
    ],
    evaluation: ["寝つくまでの時間", "夜中に目が覚める回数", "日中の調子・眠気", "睡眠日誌"],
  },
  {
    ...base,
    id: "menstrual-pain",
    name: "月経痛",
    aliases: ["生理痛", "月経困難症", "下腹部痛"],
    group: "婦人科",
    redFlags: ["月経時以外の強い下腹部痛・発熱", "妊娠の可能性", "不正出血", "年々強くなる月経痛・経血量の急な増加（子宮内膜症・子宮筋腫などは婦人科で評価）"],
    common: [
      { role: "遠隔", rec: r("SP6", "足の三陰経の交会。月経の症状に用いる代表穴") },
      { role: "遠隔", rec: r("SP8", "脾経の郄穴。急な痛みに用いる例") },
      { role: "局所", rec: r("CV4", "下腹部の局所") },
      { role: "局所", rec: r("BL32", "仙骨部の局所") },
    ],
    patterns: [
      { id: "stasis", name: "気滞血瘀", signs: ["月経前に胸や下腹が張る", "刺すような痛み", "経血に塊がある", "舌の紫斑"], principle: "理気活血", points: [r("LR3", "肝経の原穴"), r("SP10", "血の巡りを調える例"), r("LI4", "太衝と組む四関穴の例")] },
      { id: "cold", name: "寒凝", signs: ["冷えると悪化", "温めると楽", "経血が暗い色"], principle: "温経散寒", points: [r("CV4", "温灸を用いる例"), r("BL32", "温灸を用いる例")], method: "温灸" },
      { id: "def", name: "気血虚弱", signs: ["月経後半〜後に鈍く痛む", "疲れやすい", "顔色が白い"], principle: "益気養血", points: [r("ST36", "気血を補う"), r("CV6", "気を補う"), r("BL20", "脾の背部兪穴")] },
    ],
    evaluation: ["痛みの強さ（NRS）と日数", "鎮痛薬の使用", "日常生活・仕事への支障"],
    cautions: ["妊娠中・妊娠の可能性がある人では、合谷・三陰交などへの刺激を避けるべきとする伝統的な記載がある。所属機関の指針に従う"],
  },
  {
    ...base,
    id: "cough-throat",
    name: "咳・咽喉の痛み",
    aliases: ["咳", "のどの痛み", "咽頭痛", "かぜ", "喉の違和感"],
    group: "呼吸器",
    redFlags: ["呼吸困難・胸痛", "高熱・ぐったりしている", "血痰", "3週間以上続く咳", "声のかすれが2週間以上続く・飲み込めないほどの痛み"],
    common: [
      { role: "遠隔", rec: r("LU7", "肺経の絡穴。照海と組む八脈交会穴（肺系・咽喉）") },
      { role: "遠隔", rec: r("KI6", "陰蹻脈。列欠と組む") },
      { role: "局所", rec: r("BL13", "肺の背部兪穴。深部に肺") },
    ],
    patterns: [
      { id: "wind-cold", name: "風寒", signs: ["寒気", "透明な鼻水・痰", "浮緊脈"], principle: "疏風散寒・宣肺", points: [r("GB20", "風邪を除く"), r("GV14", "温める刺激を用いる例")] },
      { id: "wind-heat", name: "風熱", signs: ["のどが赤く痛む", "黄色い痰", "発熱", "浮数脈"], principle: "疏風清熱・利咽", points: [r("LU5", "肺経の合穴（水穴）。肺の実熱に瀉す穴（母子補瀉）"), r("LI4", "大腸経の原穴")] },
      { id: "lung-def", name: "肺気虚", signs: ["弱い咳が長引く", "息切れ・自汗", "かぜをひきやすい"], principle: "補肺益気", points: [r("LU9", "肺経の原穴（土穴）。肺虚に補う穴（母子補瀉）"), r("ST36", "気を補う")] },
      { id: "yin-def", name: "陰虚", signs: ["のどの乾燥", "夜に咳払い", "ほてり", "紅舌・少苔"], principle: "滋陰潤肺", points: [r("KI3", "腎経の原穴")] },
    ],
    evaluation: ["咳の回数・強さ", "のどの痛み（NRS）", "睡眠への影響", "危険徴候の有無"],
  },
  {
    ...base,
    id: "cold-fatigue",
    name: "冷え・疲れやすさ",
    aliases: ["冷え性", "手足の冷え", "倦怠感", "だるい", "疲労"],
    group: "全身",
    redFlags: ["急な体重の変化・強い倦怠感（甲状腺の病気・貧血・糖尿病など）", "足の色が悪い・冷たさの左右差・脈が触れにくい（末梢動脈疾患）", "息切れ・動悸・むくみの悪化", "気分の落ち込みが続く"],
    common: [
      { role: "背景", rec: r("ST36", "気血を補う代表穴") },
      { role: "局所", rec: r("CV4", "下腹部の局所。温灸を用いることが多い") },
      { role: "遠隔", rec: r("SP6", "足の三陰経の交会") },
    ],
    patterns: [
      { id: "yang-def", name: "脾腎陽虚", signs: ["寒がり・温めると楽", "腰や足が冷える", "夜間尿・軟便", "淡胖舌・沈遅脈"], principle: "温補脾腎", points: [r("BL23", "腎の背部兪穴"), r("GV4", "温める刺激を用いる例"), r("BL20", "脾の背部兪穴")], method: "温灸" },
      { id: "qi-stag", name: "気滞（手足の先だけ冷える）", signs: ["ストレスで悪化", "手足の先が冷える", "胸脇の張り"], principle: "疏肝理気", points: [r("LR3", "肝経の原穴"), r("LI4", "太衝と組む四関穴の例")] },
      { id: "blood-def", name: "血虚", signs: ["顔色が白い", "めまい・目の乾き", "爪がもろい", "淡舌"], principle: "補血", points: [r("BL17", "血会"), r("SP6", "血を養う例")] },
    ],
    evaluation: ["冷え・だるさの程度（10段階）", "睡眠・食欲", "活動量"],
    cautions: ["糖尿病・感覚低下のある人の足への直接灸は熱傷のリスクが高い"],
  },
];

export const symptomMap = Object.fromEntries(symptomGuides.map((g) => [g.id, g]));

/** 部位・証から取穴候補を組み立てる（重複は最初の役割にまとめ、理由を足す） */
export function assemble(guide: SymptomGuide, regionId: string | null, patternId: string | null) {
  const out: { code: string; role: PointRole; reasons: string[] }[] = [];
  const push = (role: PointRole, rec: PointRec) => {
    const hit = out.find((o) => o.code === rec.code);
    if (hit) {
      if (!hit.reasons.includes(rec.reason)) hit.reasons.push(rec.reason);
      return;
    }
    out.push({ code: rec.code, role, reasons: [rec.reason] });
  };
  const region = guide.regions?.find((r) => r.id === regionId);
  region?.local.forEach((x) => push("局所", x));
  guide.common.filter((c) => c.role === "局所").forEach((c) => push("局所", c.rec));
  region?.distal.forEach((x) => push("遠隔", x));
  guide.common.filter((c) => c.role === "遠隔").forEach((c) => push("遠隔", c.rec));
  guide.common.filter((c) => c.role === "背景").forEach((c) => push("背景", c.rec));
  guide.patterns.find((p) => p.id === patternId)?.points.forEach((x) => push("背景", x));
  return out;
}

/** 選んだ所見から、証の候補を一致数の多い順に並べる */
export function rankPatterns(guide: SymptomGuide, checked: string[]) {
  return guide.patterns
    .map((p) => ({ pattern: p, hits: p.signs.filter((s) => checked.includes(s)).length }))
    .sort((a, b) => b.hits - a.hits || b.pattern.signs.length - a.pattern.signs.length);
}
