/**
 * 子午流注（納支法）のデータ。
 * 一日を十二支の2時間ずつに分け、十二経脈の気血が流注の順に旺盛になると考える。
 * 補瀉の穴は五兪穴の五行と母子関係から自動で求める（yaoxue.ts の表を使う）。
 */
import type { MeridianId } from "./types";
import { YANG_ELEMENTS, YIN_ELEMENTS, fiveShuTable } from "./yaoxue";

export interface ZiwuSlot {
  branch: string;
  reading: string;
  start: number; // 開始時刻（時）
  end: number;
  meridian: MeridianId;
}

/** 子の刻（23〜1時）から順に */
export const ziwuSlots: ZiwuSlot[] = [
  { branch: "子", reading: "ね", start: 23, end: 1, meridian: "GB" },
  { branch: "丑", reading: "うし", start: 1, end: 3, meridian: "LR" },
  { branch: "寅", reading: "とら", start: 3, end: 5, meridian: "LU" },
  { branch: "卯", reading: "う", start: 5, end: 7, meridian: "LI" },
  { branch: "辰", reading: "たつ", start: 7, end: 9, meridian: "ST" },
  { branch: "巳", reading: "み", start: 9, end: 11, meridian: "SP" },
  { branch: "午", reading: "うま", start: 11, end: 13, meridian: "HT" },
  { branch: "未", reading: "ひつじ", start: 13, end: 15, meridian: "SI" },
  { branch: "申", reading: "さる", start: 15, end: 17, meridian: "BL" },
  { branch: "酉", reading: "とり", start: 17, end: 19, meridian: "KI" },
  { branch: "戌", reading: "いぬ", start: 19, end: 21, meridian: "PC" },
  { branch: "亥", reading: "い", start: 21, end: 23, meridian: "TE" },
];

/** 時刻（0〜23時）が属する刻の番号 */
export function slotIndexOfHour(hour: number) {
  return Math.floor(((hour + 1) % 24) / 2);
}

/** 経脈の五行（心包・三焦は火） */
export const meridianElement: Record<MeridianId, string> = {
  LU: "金",
  LI: "金",
  ST: "土",
  SP: "土",
  HT: "火",
  SI: "火",
  BL: "水",
  KI: "水",
  PC: "火",
  TE: "火",
  GB: "木",
  LR: "木",
};

const cycle = ["木", "火", "土", "金", "水"];
const motherOf = (el: string) => cycle[(cycle.indexOf(el) + 4) % 5];
const childOf = (el: string) => cycle[(cycle.indexOf(el) + 1) % 5];
const YIN: MeridianId[] = ["LU", "SP", "HT", "KI", "PC", "LR"];

function shuPointOfElement(meridian: MeridianId, element: string) {
  const row = fiveShuTable.find((r) => r.meridian === meridian)!;
  const els = YIN.includes(meridian) ? YIN_ELEMENTS : YANG_ELEMENTS;
  return row.codes[(els as readonly string[]).indexOf(element)];
}

/**
 * 納支法の補瀉：
 * ・実証：その経が旺盛な時刻に、子にあたる五行の穴を瀉す（迎えて奪う）
 * ・虚証：経気が過ぎ去った次の時刻に、母にあたる五行の穴を補う（随って済う）
 */
export function najiPoints(meridian: MeridianId) {
  const el = meridianElement[meridian];
  const idx = ziwuSlots.findIndex((s) => s.meridian === meridian);
  return {
    element: el,
    drain: { code: shuPointOfElement(meridian, childOf(el)), element: childOf(el), slot: ziwuSlots[idx] },
    tonify: { code: shuPointOfElement(meridian, motherOf(el)), element: motherOf(el), slot: ziwuSlots[(idx + 1) % 12] },
  };
}
