// 既存マニュアル（Googleドキュメント「整骨院スタッフ業務・行動マニュアル」）の取り込み設定。
// ※ このリポジトリは公開されているため、原文はここに書かない。見出しと、ルールにする行の書き出し（数文字）だけを持つ。
//   原文は管理者が取り込み画面で Googleドキュメントの書き出し（.txt）を渡したときに、サーバーで分解して DB にだけ保存する。
// 分類・重要度・状態は docs/manual-system/01_既存マニュアル分析.md の表と同じ。

import type { Category, Importance, Kind, Position } from "./config";

export const SOURCE = {
  name: "Googleドキュメント「整骨院スタッフ業務・行動マニュアル」",
  id: "14KajCiAxqUDZTVNGuvdo0LnuQ7UwSn7NlMM_x4022_o",
};

export type SectionConfig = {
  ref: string;
  heading: string; // 見出し行（先頭の「•」「⸻」と【】を外したもの）と完全に一致させる
  kind: Extract<Kind, "staff_manual" | "training">;
  category: Category;
  importance: Importance;
  status: "draft" | "legal_hold";
  note?: string; // 取り込み時の注意（分析書の該当箇所）
  targets?: Position[];
};

const LEGAL = (s: string) => `法令確認待ち（社労士確認）：分析書 ${s}`;

export const SECTIONS: SectionConfig[] = [
  { ref: "S01", heading: "挨拶、笑顔", kind: "staff_manual", category: "service", importance: "B", status: "draft" },
  { ref: "S02", heading: "身だしなみ", kind: "staff_manual", category: "service", importance: "B", status: "draft" },
  { ref: "S03", heading: "掃除", kind: "staff_manual", category: "service", importance: "B", status: "draft" },
  { ref: "S04", heading: "技術", kind: "staff_manual", category: "treatment_insurance", importance: "B", status: "draft" },
  { ref: "S05", heading: "理念浸透", kind: "staff_manual", category: "education", importance: "B", status: "draft" },
  { ref: "S06", heading: "問診", kind: "staff_manual", category: "treatment_insurance", importance: "B", status: "draft" },
  { ref: "S07", heading: "検査、写真", kind: "staff_manual", category: "treatment_insurance", importance: "B", status: "draft" },
  { ref: "S08", heading: "カウンセリング、施術後のプランニング", kind: "staff_manual", category: "treatment_insurance", importance: "B", status: "draft" },
  { ref: "S09", heading: "クチコミ依頼説明", kind: "training", category: "other", importance: "A", status: "legal_hold", note: LEGAL("§4-5（「星5で」の依頼・特典との組み合わせ）") },
  { ref: "S10", heading: "紹介依頼説明", kind: "training", category: "other", importance: "B", status: "legal_hold", note: LEGAL("§4-6（紹介特典と景品規制）") },
  { ref: "S11", heading: "院内トラブル", kind: "staff_manual", category: "complaint_accident", importance: "A", status: "draft" },
  { ref: "S12", heading: "交通事故説明", kind: "training", category: "treatment_insurance", importance: "A", status: "legal_hold", note: LEGAL("§4-3（通院指導トーク：最優先で確認）") },
  { ref: "S13", heading: "保険説明", kind: "training", category: "treatment_insurance", importance: "A", status: "legal_hold", note: LEGAL("§4-4（療養費の支給基準・回答書）") },
  { ref: "S14", heading: "宿題、運動指導、豆知識説明", kind: "staff_manual", category: "treatment_insurance", importance: "B", status: "draft" },
  { ref: "S15", heading: "むくみ、冷え性説明", kind: "training", category: "treatment_insurance", importance: "C", status: "draft" },
  { ref: "S16", heading: "頭痛の説明", kind: "training", category: "treatment_insurance", importance: "C", status: "legal_hold", note: LEGAL("§4-7（医療機関の受診を妨げない表現）") },
  { ref: "S17", heading: "肩こり → 捻挫 保険説明", kind: "training", category: "treatment_insurance", importance: "A", status: "legal_hold", note: LEGAL("§4-4（負傷原因の誘導と受け取られない表現）") },
  { ref: "S18", heading: "物販説明", kind: "training", category: "money", importance: "C", status: "draft" },
  { ref: "S19", heading: "フリーパス説明", kind: "training", category: "money", importance: "C", status: "draft" },
  { ref: "S20", heading: "巻き爪・外反母趾説明と施術", kind: "training", category: "treatment_insurance", importance: "C", status: "draft" },
  { ref: "S21", heading: "電話対応", kind: "staff_manual", category: "service", importance: "B", status: "draft" },
  { ref: "S22", heading: "受付対応", kind: "staff_manual", category: "service", importance: "B", status: "draft" },
  { ref: "S23", heading: "急患対応", kind: "staff_manual", category: "treatment_insurance", importance: "A", status: "legal_hold", note: LEGAL("§4-8（「次回を初診として」の扱い）") },
  { ref: "S24", heading: "頻度調整", kind: "training", category: "treatment_insurance", importance: "C", status: "draft" },
  { ref: "S25", heading: "インスタ運用", kind: "staff_manual", category: "privacy_sns", importance: "B", status: "legal_hold", note: LEGAL("§4-6（施術所の広告規制・写真の同意）") },
  { ref: "S26", heading: "LINE対応・サンキューLINE", kind: "staff_manual", category: "communication", importance: "B", status: "draft" },
  { ref: "S27", heading: "ブラックボード", kind: "staff_manual", category: "other", importance: "C", status: "draft", note: "「無料体験」の表記は分析書 §4-6 の確認対象" },
  { ref: "S28", heading: "オンライン集客編集", kind: "staff_manual", category: "other", importance: "C", status: "draft" },
  { ref: "S29", heading: "お出迎え・お見送り", kind: "staff_manual", category: "service", importance: "B", status: "draft" },
  { ref: "S30", heading: "空間把握・活気", kind: "staff_manual", category: "service", importance: "C", status: "draft" },
  { ref: "S31", heading: "レセプト作業・書類作成", kind: "staff_manual", category: "treatment_insurance", importance: "A", status: "draft" },
  { ref: "S32", heading: "朝礼・終礼", kind: "staff_manual", category: "meeting", importance: "B", status: "legal_hold", note: LEGAL("§4-2（着替えとタイムカードの順番）") },
  { ref: "S33", heading: "院内会議", kind: "staff_manual", category: "meeting", importance: "B", status: "draft" },
  { ref: "S34", heading: "レジ締め", kind: "staff_manual", category: "money", importance: "A", status: "draft" },
  { ref: "S35", heading: "遅刻・欠席・早退", kind: "staff_manual", category: "attendance", importance: "A", status: "legal_hold", note: LEGAL("§4-1（反省文・減給・降格と就業規則）") },
  { ref: "S36", heading: "電話連絡・報連相", kind: "staff_manual", category: "communication", importance: "A", status: "draft", note: "未確定：原文の「マネージャー」は、その院の担当エリアの責任者（BM。BMがいない院は GM）と解釈。GM確認" },
  { ref: "S37", heading: "気遣い・心遣い", kind: "training", category: "other", importance: "C", status: "draft" },
  { ref: "S38", heading: "スタッフコミュニケーション", kind: "training", category: "communication", importance: "C", status: "draft" },
  { ref: "S39", heading: "ブラザー制度（フォローアップ）", kind: "staff_manual", category: "education", importance: "B", status: "draft", note: "未確定：小口からの食事の金額上限・精算方法・報告先（分析書 §4-9）。GM確認" },
  { ref: "S40", heading: "勉強会・会議・イベント出席", kind: "training", category: "education", importance: "B", status: "legal_hold", note: LEGAL("§4-2（義務参加は労働時間）") },
  { ref: "S41", heading: "努力の姿勢", kind: "training", category: "other", importance: "C", status: "draft", note: "未確定：公式マニュアルとしての表現（分析書 §4-10）。GM判断" },
  { ref: "S42", heading: "労働時間（固定残業確認）", kind: "staff_manual", category: "attendance", importance: "A", status: "legal_hold", note: LEGAL("§4-2（固定残業代の明示・義務参加）") },
  { ref: "S43", heading: "数値管理・行動管理", kind: "staff_manual", category: "education", importance: "B", status: "draft" },
  { ref: "S44", heading: "在庫管理", kind: "staff_manual", category: "money", importance: "B", status: "draft" },
  { ref: "S45", heading: "規律・社会人としての振る舞い", kind: "training", category: "other", importance: "C", status: "draft" },
  { ref: "S46", heading: "急な出勤やヘルプ", kind: "training", category: "shift", importance: "C", status: "legal_hold", note: LEGAL("§4-2（急な出勤の勤怠記録）") },
  { ref: "S47", heading: "慕われる力", kind: "training", category: "other", importance: "C", status: "draft" },
  { ref: "S48", heading: "共感と感謝", kind: "training", category: "other", importance: "C", status: "draft", note: "原文欠落：「思考」の部分がありません。原文の確認が必要" },
];

// 大見出し（章）。ここで前の項目が終わる
export const CHAPTER_LINE = /^[1-7]\.\s/;

// 会社ルールの確定候補（分析書 §3）。原文の中から、書き出しが一致する行（と、その続きの行）をそのまま取り出す
export type RuleConfig = {
  code: string;
  title: string;
  ref: string; // 取り出し元の項目
  category: Category;
  importance: Importance;
  starts: string[]; // 行の書き出し
  note?: string;
};

export const RULES: RuleConfig[] = [
  { code: "RULE-SVC-001", title: "来院時・お会計後・お見送りの挨拶", ref: "S01", category: "service", importance: "B", starts: ["⭐患者様が来院時", "⭐患者様のお会計", "⭐誰かが来院時"] },
  { code: "RULE-SVC-002", title: "身だしなみ（インナー・ズボン）", ref: "S02", category: "service", importance: "B", starts: ["⭐インナー", "⭐黒ズボン"] },
  { code: "RULE-SVC-003", title: "朝礼後の清掃と担当エリア", ref: "S03", category: "service", importance: "B", starts: ["• チェック体制", "⭐朝礼後15分", "⭐機械類", "⭐ごみ捨て", "⭐トイレ"] },
  { code: "RULE-EDU-001", title: "朝礼での理念の唱和・共有", ref: "S05", category: "education", importance: "B", starts: ["• 毎朝礼で"] },
  { code: "RULE-SVC-004", title: "電話は3コール以内", ref: "S21", category: "service", importance: "B", starts: ["• 行動：3コール"] },
  { code: "RULE-SVC-005", title: "受付での挨拶とお金の受け渡し", ref: "S22", category: "service", importance: "B", starts: ["⭐事務作", "⭐会計処理"] },
  { code: "RULE-COM-001", title: "LINE問い合わせへの返信", ref: "S26", category: "communication", importance: "B", starts: ["• 行動：来院当日", "⭐必ず返信", "⭐新患からの", "⭐空き時間"] },
  { code: "RULE-OTH-001", title: "ブラックボードの書き換え", ref: "S27", category: "other", importance: "C", starts: ["⭐基本月に1回"] },
  { code: "RULE-INS-001", title: "宿題・運動指導のカルテ記載", ref: "S14", category: "treatment_insurance", importance: "B", starts: ["• 宿題・運動指導はカルテ"] },
  { code: "RULE-INS-002", title: "来院受付・部位入力・レセプトの確認", ref: "S31", category: "treatment_insurance", importance: "A", starts: ["• 行動：ミスなく", "⭐最終確認は院長", "⭐来院受付"] },
  { code: "RULE-CMP-001", title: "院内トラブルの報告・記録・フォロー", ref: "S11", category: "complaint_accident", importance: "A", starts: ["• 施術中や院内で", "• 記録は必ず", "• 説明後も数日間"] },
  { code: "RULE-CMP-002", title: "ODコールの報告", ref: "S36", category: "complaint_accident", importance: "A", starts: ["⭐ODコール", "※院長はOD"] },
  { code: "RULE-ATT-001", title: "遅刻・欠席・早退の連絡", ref: "S36", category: "attendance", importance: "A", starts: ["⭐遅刻・欠席・早退の場合", "※院長が当事者"], note: "未確定：最初に電話する相手の順序（S35「社長・院長」／S36「院長・社長」）と「マネージャー」の解釈。GM確認" },
  { code: "RULE-MTG-001", title: "院内会議の開催頻度", ref: "S33", category: "meeting", importance: "B", starts: ["⭐進捗会議", "⭐問題解決会議", "定期開催"] },
  { code: "RULE-MNY-001", title: "レジ締め", ref: "S34", category: "money", importance: "A", starts: ["⭐終業後"] },
  { code: "RULE-MNY-002", title: "在庫管理と備品の購入", ref: "S44", category: "money", importance: "B", starts: ["月に2回程度", "（責任者を1人", "※ダイヤ工業"] },
  { code: "RULE-EDU-002", title: "数値管理と週1回の報告", ref: "S43", category: "education", importance: "B", starts: ["⭐原則スプレッドシート", "⭐各項目ごと"] },
];
