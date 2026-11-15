// 画面とサーバーで共通の定義（役職・カテゴリ・状態・院）

export const POSITIONS = ["president", "gm", "bm", "manager", "sub_manager", "chief", "staff", "newcomer"] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_LABEL: Record<Position, string> = {
  president: "社長", gm: "GM", bm: "BM", manager: "院長", sub_manager: "副院長", chief: "チーフ", staff: "スタッフ", newcomer: "新人",
};
// 承認・編集の力を持つ役職。院ID＋個人PASSのログインではこの力は使えない（メールアドレスでのログインが必要）
export const PRIVILEGED: readonly Position[] = ["president", "gm", "bm", "manager"];
// 全社（院を持たない）役職
export const COMPANY_WIDE: readonly Position[] = ["president", "gm"];

export const CLINICS = [
  { id: "hirakata", name: "枚方本院", short: "枚方" },
  { id: "taguchiyama", name: "田口山院", short: "田口山" },
  { id: "tsuda", name: "津田院", short: "津田" },
  { id: "katano", name: "交野院", short: "交野" },
  { id: "ibaraki", name: "茨木院", short: "茨木" },
  { id: "owada", name: "大和田院", short: "大和田" },
  { id: "korien", name: "香里園院", short: "香里園" },
] as const;
export type ClinicId = (typeof CLINICS)[number]["id"];
export const CLINIC_IDS = CLINICS.map((c) => c.id) as string[];
export const clinicName = (id: string | null | undefined) => CLINICS.find((c) => c.id === id)?.name ?? (id ? id : "全社");
// 台帳の院名（「枚方」「田口山」…。canonClinic 済み）→ 院ID
export const clinicIdFromLedger = (name: string) => CLINICS.find((c) => c.short === name || c.name === name)?.id ?? null;

export const CATEGORIES = [
  ["attendance", "勤怠・遅刻・早退・欠勤", "ATT"],
  ["paid_leave", "有給休暇", "PAL"],
  ["substitute_holiday", "振替休日", "SUB"],
  ["part_time", "アルバイト申請", "PTW"],
  ["shift", "シフト管理", "SFT"],
  ["communication", "報告・連絡・相談", "COM"],
  ["meeting", "会議・議事録", "MTG"],
  ["service", "接遇・身だしなみ", "SVC"],
  ["treatment_insurance", "施術・保険業務", "INS"],
  ["privacy_sns", "個人情報・SNS", "PRV"],
  ["money", "金銭管理", "MNY"],
  ["complaint_accident", "クレーム・事故対応", "CMP"],
  ["education", "教育・評価", "EDU"],
  ["other", "その他", "OTH"],
] as const;
export type Category = (typeof CATEGORIES)[number][0];
export const CATEGORY_IDS = CATEGORIES.map((c) => c[0]) as unknown as [Category, ...Category[]];
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x[0] === c)?.[1] ?? c;
export const categoryPrefix = (c: string) => CATEGORIES.find((x) => x[0] === c)?.[2] ?? "OTH";

export const KINDS = ["rule", "staff_manual", "manager_manual", "training"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = {
  rule: "会社ルール", staff_manual: "スタッフ業務マニュアル", manager_manual: "院長・管理職マニュアル", training: "教育資料・説明トーク",
};

export const STATUSES = ["draft", "returned", "gm_review", "president_approval", "legal_hold", "published", "superseded", "archived"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  draft: "下書き", returned: "差し戻し", gm_review: "GM確認待ち", president_approval: "社長承認待ち",
  legal_hold: "法令確認待ち", published: "公開中", superseded: "旧版", archived: "廃止",
};
export const OPEN_STATUSES: readonly Status[] = ["draft", "returned", "gm_review", "president_approval", "legal_hold"];

export const IMPORTANCE_LABEL = { A: "重要度A（事故・法令・信用）", B: "重要度B（運営の決まり）", C: "重要度C（推奨・心構え）" } as const;
export type Importance = keyof typeof IMPORTANCE_LABEL;
