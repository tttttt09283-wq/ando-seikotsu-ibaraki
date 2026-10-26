/**
 * 各院に配る「使い始めセット」の Excel。
 * 1ファイルに「はじめに（端末の設定・院長のログイン・配り方）」「PIN配布票（切り取って本人に渡す）」「スタッフ一覧」をまとめる。
 * PIN と登録コードはこのファイルにだけ載る（DB にはハッシュのみ）。
 */
import ExcelJS from "exceljs";

export type KitPinState = "issued" | "existing" | "none";

export interface KitInput {
  clinicName: string;
  issuedAt: string; // 表示用（JST）
  appUrl: string; // 院長がログインする URL
  kioskUrl: string; // 打刻端末で開く URL
  registration: { deviceName: string; code: string; expiresAt: string; qrPng: Buffer } | null;
  managers: { name: string; email: string }[];
  staff: { code: string; name: string; pin: string | null; state: KitPinState }[];
}

export const PIN_STATE_LABELS: Record<KitPinState, string> = {
  issued: "今回発行（配布票あり）",
  existing: "発行済み（今のPINのまま）",
  none: "未発行（打刻できません）",
};

const BRAND = "FF0E8893";
const thin = { style: "thin" as const, color: { argb: "FF94A3B8" } };
const dashed = { style: "dashed" as const, color: { argb: "FF94A3B8" } };

export function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function buildKitWorkbook(input: KitInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "あんど整骨院グループ 勤怠管理";
  addGuideSheet(wb, input);
  addSlipSheet(wb, input);
  addStaffSheet(wb, input);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addGuideSheet(wb: ExcelJS.Workbook, input: KitInput) {
  const ws = wb.addWorksheet("はじめに", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 62;
  let row = 1;
  const line = (label: string, value = "", opts: { bold?: boolean; size?: number; color?: string } = {}) => {
    ws.getCell(row, 2).value = label;
    ws.getCell(row, 3).value = value;
    ws.getCell(row, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(row, 2).alignment = { vertical: "top" };
    if (opts.bold || opts.size || opts.color) {
      ws.getCell(row, 3).font = { bold: opts.bold, size: opts.size, color: opts.color ? { argb: opts.color } : undefined };
    }
    row++;
  };
  const heading = (text: string) => {
    row++;
    const c = ws.getCell(row, 2);
    c.value = text;
    c.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    ws.mergeCells(row, 2, row, 3);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    row++;
  };

  ws.getCell(row, 2).value = `${input.clinicName}　勤怠システム 使い始めセット`;
  ws.getCell(row, 2).font = { bold: true, size: 16 };
  row += 2;
  line("発行日時", input.issuedAt);
  line("取り扱い", "このファイルには登録コードとPINが載っています。院長が保管し、配布と端末の設定が終わったら削除してください。", {
    bold: true,
    color: "FFDC2626",
  });

  heading("1. 打刻端末（院のタブレット）の設定");
  if (input.registration) {
    const r = input.registration;
    line("端末名", r.deviceName);
    line("登録コード", formatCode(r.code), { bold: true, size: 20 });
    line("有効期限", `${r.expiresAt} まで（過ぎたら本部に再発行を依頼してください）`);
    line("手順1", "タブレットのカメラで右下の QR コードを読み取る（または Safari / Chrome で下の URL を開く）");
    line("手順2", "「この端末はまだ登録されていません」の画面で、登録コードが入っていることを確認して「登録」を押す（入っていなければ上の登録コードを入力）");
    line("手順3", "「打刻する」の画面になれば完了。ホーム画面に追加し、iPad は「アクセスガイド」でこの画面に固定するのがおすすめです");
    line("端末のURL", input.kioskUrl);
    const qrRow = row;
    row += 12;
    const id = wb.addImage({ buffer: r.qrPng as unknown as ExcelJS.Buffer, extension: "png" });
    ws.addImage(id, { tl: { col: 2, row: qrRow }, ext: { width: 180, height: 180 } });
  } else {
    line("", "今回は端末の登録コードを発行していません（登録済みの端末をそのまま使います）。");
    line("端末のURL", input.kioskUrl);
  }

  heading("2. 院長のログイン（シフト作成・勤怠の確認・承認）");
  line("ログインURL", input.appUrl);
  if (input.managers.length === 0) {
    line("アカウント", "この院の院長アカウントがまだありません。本部に作成を依頼してください。");
  } else {
    for (const m of input.managers) line("アカウント", `${m.name}　${m.email}`);
  }
  line("パスワード", "安全のため、このファイルには載せていません。本部から別にお知らせします。");

  heading("3. スタッフへの配り方");
  line("手順1", "「PIN配布票」シートを印刷し、点線で切り分けて本人に直接渡す（LINE やメールで送らない）");
  line("手順2", "打刻するときは「スタッフ番号」と「PIN」を入力する");
  line("手順3", "初めて打刻するときに、自分だけが知っているPIN（4〜8桁）に変更する");
  line("注意", "「スタッフ一覧」で「未発行」のスタッフは打刻できません。本部に発行を依頼してください。");

  heading("4. 困ったとき");
  line("PINを忘れた", "本部に再発行を依頼してください（今のPINは使えなくなります）");
  line("ロックされた", "5回続けて間違えると15分間ロックされます。時間をおいてやり直すか、本部に解除を依頼してください");
  line("打刻を忘れた・間違えた", "院長の画面の「打刻修正」から申請してください");
  line("端末を交換・紛失した", "本部に連絡してください（古い端末を止めて、新しい登録コードを発行します）");
}

function addSlipSheet(wb: ExcelJS.Workbook, input: KitInput) {
  const ws = wb.addWorksheet("PIN配布票", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 40;
  const issued = input.staff.filter((s) => s.state === "issued" && s.pin);
  if (issued.length === 0) {
    ws.getCell(2, 2).value = "今回PINを発行したスタッフはいません。";
    return;
  }
  ws.getCell(1, 2).value = "点線で切り取って、本人に直接渡してください";
  ws.getCell(1, 2).font = { color: { argb: "FF64748B" } };
  let row = 3;
  for (const s of issued) {
    const rows: [string, string][] = [
      ["", `あんど整骨院グループ　打刻用PIN（${input.clinicName}）`],
      ["氏名", s.name],
      ["スタッフ番号", s.code],
      ["初期PIN", s.pin ?? ""],
      ["", "初めて打刻するときに、自分だけが知っているPINに変更してください。この紙は変更後に捨ててください。"],
    ];
    rows.forEach(([label, value], i) => {
      const r = row + i;
      ws.getCell(r, 2).value = label;
      ws.getCell(r, 3).value = value;
      ws.getCell(r, 3).alignment = { wrapText: true };
      for (const col of [2, 3]) {
        ws.getCell(r, col).border = {
          left: col === 2 ? thin : undefined,
          right: col === 3 ? thin : undefined,
          top: i === 0 ? thin : undefined,
          bottom: i === rows.length - 1 ? thin : undefined,
        };
      }
    });
    ws.getCell(row, 3).font = { bold: true, color: { argb: BRAND } };
    ws.getCell(row + 3, 3).font = { bold: true, size: 20 };
    ws.getCell(row + 4, 3).font = { size: 9, color: { argb: "FF64748B" } };
    ws.getRow(row + 4).height = 28;
    const cut = row + rows.length;
    for (const col of [1, 2, 3]) ws.getCell(cut, col).border = { bottom: dashed };
    row = cut + 2;
  }
}

function addStaffSheet(wb: ExcelJS.Workbook, input: KitInput) {
  const ws = wb.addWorksheet("スタッフ一覧", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "スタッフ番号", key: "code", width: 14 },
    { header: "氏名", key: "name", width: 20 },
    { header: "PIN", key: "state", width: 28 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const s of input.staff) ws.addRow({ code: s.code, name: s.name, state: PIN_STATE_LABELS[s.state] });
}
