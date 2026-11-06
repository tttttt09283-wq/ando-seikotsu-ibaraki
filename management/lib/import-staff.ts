// スタッフCSVの検証（全7院のスタッフを一括登録）
import { parseDate } from "./csv";
import { LOGIN_ID_PATTERN, normalizeLoginId } from "./login-id";
import type { RoleCode } from "./roles";
import type { ValidatedRow } from "./leave/import-balance";

export const STAFF_HEADERS = {
  required: ["スタッフID", "氏名", "ログインID", "雇用区分", "所属店舗", "役職"],
  optional: ["ふりがな", "入社日", "POSスタッフ番号"],
};
export const STAFF_TEMPLATE = [
  "スタッフID,氏名,ふりがな,ログインID,雇用区分,入社日,所属店舗,役職,POSスタッフ番号",
  "A001,田中 太郎,たなか たろう,tanaka,正社員,2022/04/01,茨木院,院長,",
  "A002,佐藤 花子,さとう はなこ,sato,正社員,2025/04/01,交野院;茨木院,一般スタッフ,",
  "A003,鈴木 一郎,,suzuki,アルバイト,2026/04/01,香里園院,アルバイト,",
].join("\r\n");

export type StaffRowData = {
  staff_code: string; name: string; name_kana: string | null; login_id: string; employment_type: string; hire_date: string | null;
  assignments: { store_id: string; store_name: string; role: RoleCode; is_primary: boolean }[];
  global_role: "PRESIDENT" | "GM" | null; pos_staff_id: number | null;
};
export type StaffContext = {
  stores: { id: string; code: string; name: string }[];
  existingStaffCodes: Set<string>;
  existingLoginIds: Set<string>;
  existingPosIds: Set<number>;
};

const ROLE_FROM_LABEL: Record<string, RoleCode> = {
  社長: "PRESIDENT", 代表: "PRESIDENT", GM: "GM", ＧＭ: "GM", BM: "BM", ＢＭ: "BM",
  院長: "MANAGER", 一般スタッフ: "STAFF", スタッフ: "STAFF", 一般: "STAFF", アルバイト: "PART_TIMER", バイト: "PART_TIMER",
};
const EMPLOYMENT = ["役員", "正社員", "短時間正社員", "アルバイト"];
const split = (s: string) => s.split(/[;；、／/]/).map((x) => x.trim()).filter(Boolean);

// 店舗名の表記ゆれ（「あんど整骨院 香里園駅前院」「香里園院」「KORIEN」など）を吸収
export function canonStoreName(s: string): string {
  return s.replace(/あんど整骨院/g, "").replace(/[\s　]/g, "").replace(/駅前/g, "").replace(/(本院|分院|院)$/, "").toUpperCase();
}
export function matchStore(label: string, stores: StaffContext["stores"]) {
  const c = canonStoreName(label);
  return stores.find((s) => s.code === c || canonStoreName(s.name) === c) ?? null;
}

export function validateStaffRecords(headers: string[], records: { rowNo: number; values: Record<string, string> }[], ctx: StaffContext) {
  const fileErrors: string[] = [];
  const missing = STAFF_HEADERS.required.filter((h) => !headers.includes(h));
  if (missing.length) fileErrors.push(`見出しが足りません：${missing.join("・")}`);
  if (!records.length) fileErrors.push("データの行がありません");
  if (records.length > 500) fileErrors.push("1回に取り込めるのは500人までです");
  if (fileErrors.length) return { fileErrors, rows: [] as ValidatedRow<StaffRowData>[] };

  const seenCode = new Map<string, number>(), seenLogin = new Map<string, number>(), seenPos = new Map<number, number>();
  const rows = records.map(({ rowNo, values: v }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const d: Partial<StaffRowData> = {};

    d.staff_code = v["スタッフID"];
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(d.staff_code ?? "")) errors.push("スタッフIDは半角英数字・_・- の20文字以内です");
    else if (ctx.existingStaffCodes.has(d.staff_code!)) errors.push("このスタッフIDはすでに登録されています");
    else if (seenCode.has(d.staff_code!)) errors.push(`${seenCode.get(d.staff_code!)}行目と同じスタッフIDです`);
    else seenCode.set(d.staff_code!, rowNo);

    d.name = (v["氏名"] ?? "").trim();
    if (!d.name || d.name.length > 40) errors.push("氏名を40文字以内で入れてください");
    d.name_kana = v["ふりがな"] ? v["ふりがな"].slice(0, 60) : null;

    d.login_id = normalizeLoginId(v["ログインID"] ?? "");
    if (!LOGIN_ID_PATTERN.test(d.login_id)) errors.push("ログインIDは半角英小文字・数字（._- 可）の3〜32文字です");
    else if (ctx.existingLoginIds.has(d.login_id)) errors.push("このログインIDはすでに登録されています");
    else if (seenLogin.has(d.login_id)) errors.push(`${seenLogin.get(d.login_id)}行目と同じログインIDです`);
    else seenLogin.set(d.login_id, rowNo);

    d.employment_type = (v["雇用区分"] ?? "").trim();
    if (!EMPLOYMENT.includes(d.employment_type)) errors.push(`雇用区分は ${EMPLOYMENT.join("・")} のいずれかです`);

    d.hire_date = v["入社日"] ? parseDate(v["入社日"]) : null;
    if (v["入社日"] && !d.hire_date) errors.push("入社日が日付になっていません");
    if (!v["入社日"] && d.employment_type !== "役員") warnings.push("入社日が空欄です（有給の付与予定を計算できません）");

    const pos = v["POSスタッフ番号"] ? Number(v["POSスタッフ番号"]) : null;
    if (pos !== null && !(Number.isInteger(pos) && pos > 0)) errors.push("POSスタッフ番号が正しくありません");
    else if (pos !== null && ctx.existingPosIds.has(pos)) errors.push("このPOSスタッフ番号はすでに別の人に紐づいています");
    else if (pos !== null && seenPos.has(pos)) errors.push(`${seenPos.get(pos)}行目と同じPOSスタッフ番号です`);
    else if (pos !== null) seenPos.set(pos, rowNo);
    d.pos_staff_id = pos;

    const roleLabels = split(v["役職"] ?? "");
    const storeLabels = split(v["所属店舗"] ?? "");
    const roles = roleLabels.map((r) => ROLE_FROM_LABEL[r.replace(/[\s　]/g, "")] ?? null);
    d.global_role = null;
    d.assignments = [];
    if (!roleLabels.length) errors.push("役職が空です");
    else if (roles.some((r) => r === null)) errors.push("役職は 社長・GM・院長・一般スタッフ・アルバイト のいずれかです");
    else if (roles.includes("BM")) errors.push("BMは担当エリアと一緒に、スタッフ管理の画面で設定してください");
    else if (roles.some((r) => r === "PRESIDENT" || r === "GM")) {
      if (roles.length > 1 || storeLabels.length) errors.push("社長・GMの行は、役職を1つだけにして所属店舗を空欄にしてください");
      else d.global_role = roles[0] as "PRESIDENT" | "GM";
    } else {
      if (!storeLabels.length) errors.push("所属店舗が空です");
      else if (roles.length !== 1 && roles.length !== storeLabels.length) errors.push("所属店舗と役職の数が合いません（店舗ごとに役職を「;」で区切るか、役職を1つにしてください）");
      else {
        storeLabels.forEach((label, i) => {
          const s = matchStore(label, ctx.stores);
          if (!s) errors.push(`所属店舗「${label}」が見つかりません`);
          else d.assignments!.push({ store_id: s.id, store_name: s.name, role: (roles.length === 1 ? roles[0] : roles[i]) as RoleCode, is_primary: i === 0 });
        });
        const ids = d.assignments.map((a) => a.store_id);
        if (new Set(ids).size !== ids.length) errors.push("同じ店舗が2回書かれています");
      }
    }
    return { rowNo, data: d, errors, warnings };
  });
  return { fileErrors, rows };
}
