/**
 * LINE・通知の文面。医療効果を保証する表現は使わない。
 */
import type { Location, Reservation } from "./types";
import { formatRange, yen } from "../time";

export const BRAND_NAME = "岩永拓己 鍼灸";

/** フォーム送信後、利用者がLINEで送信する文面（予約番号＋確認コードで本人の仮予約と照合する） */
export function buildLinePrefill(p: { code: string; verifyCode: string; locationName: string; when: string; menu: string }): string {
  return [
    "【仮予約の申請】",
    `予約番号：${p.code}`,
    `確認コード：${p.verifyCode}`,
    `場所：${p.locationName}`,
    `日時：${p.when}`,
    `メニュー：${p.menu}`,
    "",
    "※このまま送信してください。送信後、内容を確認してご連絡します（この時点では予約は確定していません）。",
  ].join("\n");
}

const CODE_RE = /予約番号\s*[:：]\s*(IW-[2-9A-HJ-NP-Z]{6})/;
const VERIFY_RE = /確認コード\s*[:：]\s*([0-9０-９]{6})/;

/** 受信したLINEメッセージから予約番号・確認コードを取り出す */
export function parseLineMessage(text: string): { code: string; verifyCode: string } | null {
  const c = text.match(CODE_RE);
  const v = text.match(VERIFY_RE);
  if (!c || !v) return null;
  const verifyCode = v[1].replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  return { code: c[1], verifyCode };
}

export function lineReceivedReply(code: string): string {
  return [
    `予約番号 ${code} の仮予約を受け付けました。`,
    "",
    "まだ予約は確定していません。",
    "内容を確認のうえ、このLINEで確定のご連絡をいたします。しばらくお待ちください。",
  ].join("\n");
}

function detailLines(r: Reservation, loc: Location): string[] {
  const s = r.service_snapshot;
  return [
    `予約番号：${r.code}`,
    `施術場所：${loc.name}`,
    `日時：${formatRange(r.start_at, r.end_at)}`,
    `メニュー：${s.name}`,
    `料金：${yen(s.price_tax_included)}（税込）`,
    `所要時間：${s.duration_minutes}分`,
  ];
}

/** 予約確定メッセージ（管理者の承認後にだけ送る） */
export function confirmationMessage(r: Reservation, loc: Location): string {
  const lines = ["【ご予約が確定しました】", "", ...detailLines(r, loc)];
  // 自宅院の詳細住所は、確定した本人にだけ案内する
  if (loc.kind === "home" && loc.private_address) lines.push(`住所：${loc.private_address}`);
  else if (loc.kind === "workplace") lines.push(`所在地：${loc.public_area}`);
  if (loc.precautions) lines.push("", "■ 注意事項", loc.precautions);
  lines.push("", "■ 変更・キャンセル", loc.contact_info || "このLINEにメッセージでご連絡ください。");
  if (loc.cancel_policy) lines.push("", "■ キャンセル規定", loc.cancel_policy);
  return lines.join("\n");
}

export function changeProposalMessage(r: Reservation, loc: Location): string {
  return [
    "【日時変更のご相談】",
    "ご希望の日時でのご案内が難しいため、次の日時をご提案します。",
    "",
    ...detailLines(r, loc),
    "",
    "この日時でよろしければ、このLINEに「承諾」とお送りください。",
    "ご都合が合わない場合もお知らせください。",
    "※ご返信を確認し、こちらで確定するまで予約は確定していません。",
  ].join("\n");
}

export function cancellationMessage(r: Reservation, loc: Location, reason: string | null): string {
  return [
    "【ご予約のキャンセル】",
    `予約番号 ${r.code}（${loc.name} ${formatRange(r.start_at, r.end_at)}）をキャンセルしました。`,
    reason ? `理由：${reason}` : "",
    "",
    "ご不明な点はこのLINEにお問い合わせください。",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * 管理者向け通知。
 * person を渡したときだけ、お名前・電話番号・ご相談内容を載せる（管理者本人の LINE・メール宛てのみ。
 * 管理画面の通知履歴には個人情報を残さないため、そちらには person なしの文面の1行目だけを保存する）
 */
export function adminNewHoldText(
  r: Reservation,
  loc: Location,
  kind: "new_hold" | "line_received",
  person?: { name: string; phone: string; consultation: string } | null,
  detailUrl?: string | null,
): string {
  const head = kind === "new_hold" ? "【新規仮予約（LINE未確認）】" : "【LINE受付確認済み・承認待ち】";
  const lines = [head, `予約番号：${r.code}`, `場所：${loc.short_name}`, `日時：${formatRange(r.start_at, r.end_at)}`, `メニュー：${r.service_snapshot.name}`];
  if (person) {
    lines.push(`お名前：${person.name}`, `電話番号：${person.phone}`, `ご相談内容：${person.consultation || "（なし）"}`);
  }
  lines.push(detailUrl ? `確認・承認はこちら：${detailUrl}` : "管理画面で内容を確認してください。");
  return lines.join("\n");
}
