/**
 * History.gs
 * 「発行履歴」シートの作成・記録・検索、自動採番、二重発行チェック。
 * 履歴は PDF の作成が最後まで成功した場合にだけ記録します。
 */

const IQ_HISTORY_HEADERS = Object.freeze([
  '種別', '番号', '発行日時', '顧客名', '合計金額', 'PDF URL', 'ステータス',
  '顧客ID', '件名', '書類日付', '期限', 'ファイルID',
]);
const IQ_HISTORY_COL = Object.freeze({
  type: 1, number: 2, issuedAt: 3, customerName: 4, amount: 5, url: 6, status: 7,
  customerId: 8, subject: 9, docDate: 10, deadline: 11, fileId: 12,
});
const IQ_HISTORY_MAX_ROWS = 5000;

function ensureHistorySheet_(ss) {
  return ss.getSheetByName(IQ.SHEETS.HISTORY) || buildHistorySheet_(ss);
}

function buildHistorySheet_(ss) {
  const sheet = ss.insertSheet(IQ.SHEETS.HISTORY);
  const cols = IQ_HISTORY_HEADERS.length;
  sheet.getRange(1, 1, 1, cols).setValues([IQ_HISTORY_HEADERS.slice()]);
  styleHeader_(sheet.getRange(1, 1, 1, cols)).setHorizontalAlignment('center');
  sheet.setRowHeight(1, 30);
  sheet.setFrozenRows(1);

  const n = IQ_HISTORY_MAX_ROWS - 1;
  sheet.getRange(2, IQ_HISTORY_COL.number, n, 1).setNumberFormat('@');
  sheet.getRange(2, IQ_HISTORY_COL.issuedAt, n, 1).setNumberFormat('yyyy/mm/dd hh:mm');
  sheet.getRange(2, IQ_HISTORY_COL.amount, n, 1).setNumberFormat('#,##0').setHorizontalAlignment('right');
  sheet.getRange(2, IQ_HISTORY_COL.customerId, n, 1).setNumberFormat('@');
  sheet.getRange(2, IQ_HISTORY_COL.docDate, n, 2).setNumberFormat('yyyy/mm/dd');
  sheet.getRange(2, IQ_HISTORY_COL.fileId, n, 1).setNumberFormat('@');
  sheet.getRange(2, IQ_HISTORY_COL.status, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([IQ.STATUS.ISSUED, IQ.STATUS.REISSUED, IQ.STATUS.CANCELED], true)
      .setAllowInvalid(false)
      .setHelpText('発行を取り消した書類は「取消」にすると、同じ番号で再発行できます。')
      .build());

  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$G2="' + IQ.STATUS.CANCELED + '"')
    .setFontColor('#9AA0A6')
    .setStrikethrough(true)
    .setRanges([sheet.getRange(2, 1, n, cols)])
    .build();
  sheet.setConditionalFormatRules([rule]);

  [70, 150, 130, 200, 110, 260, 80, 80, 200, 90, 90, 120].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.hideColumns(IQ_HISTORY_COL.fileId);
  return sheet;
}

function readHistoryRows_() {
  const sheet = getRequiredSheet_(IQ.SHEETS.HISTORY);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, IQ_HISTORY_HEADERS.length).getValues();
}

/**
 * 同じ種別・番号で発行済み（取消以外）の履歴を探す。
 * @return {Array<{row:number, issuedAt:*, customerName:string, status:string}>}
 */
function findIssuedRecords(docLabel, number) {
  const key = normalizeKey(number);
  if (!key) return [];
  const result = [];
  readHistoryRows_().forEach((r, i) => {
    if (String(r[IQ_HISTORY_COL.type - 1]) !== docLabel) return;
    if (normalizeKey(r[IQ_HISTORY_COL.number - 1]) !== key) return;
    if (String(r[IQ_HISTORY_COL.status - 1]) === IQ.STATUS.CANCELED) return;
    result.push({
      row: i + 2,
      issuedAt: r[IQ_HISTORY_COL.issuedAt - 1],
      customerName: String(r[IQ_HISTORY_COL.customerName - 1]),
      status: String(r[IQ_HISTORY_COL.status - 1]),
    });
  });
  return result;
}

/**
 * 次の書類番号を採番する（例：INV-202610-001）。
 * 同じ接頭辞・同じ年月の番号のうち最大の連番 + 1。取消済みの番号も再利用しません。
 */
function nextDocumentNumber(docLabel, prefix, issueParts) {
  const base = toHalfWidth(prefix || '') + issueParts.y + pad2(issueParts.m) + '-';
  const baseKey = normalizeKey(base);
  let max = 0;
  readHistoryRows_().forEach((r) => {
    if (String(r[IQ_HISTORY_COL.type - 1]) !== docLabel) return;
    const key = normalizeKey(r[IQ_HISTORY_COL.number - 1]);
    if (key.indexOf(baseKey) !== 0) return;
    const seq = key.slice(baseKey.length);
    if (/^\d{1,6}$/.test(seq)) max = Math.max(max, Number(seq));
  });
  return base + ('00' + (max + 1)).slice(-Math.max(3, String(max + 1).length));
}

/**
 * 発行履歴を1行追加する（PDF 作成成功後にのみ呼ぶ）。
 * @param {{type:string, number:string, customerName:string, amount:number, url:string,
 *          status:string, customerId:string, subject:string, docDate:Object, deadline:Object, fileId:string}} rec
 */
function appendHistory(rec) {
  const sheet = getRequiredSheet_(IQ.SHEETS.HISTORY);
  const row = Math.max(sheet.getLastRow() + 1, 2);
  const values = [[
    rec.type,
    rec.number,
    new Date(),
    rec.customerName,
    rec.amount,
    rec.url,
    rec.status,
    rec.customerId,
    rec.subject || '',
    formatPartsSlash(rec.docDate),
    formatPartsSlash(rec.deadline),
    rec.fileId,
  ]];
  sheet.getRange(row, 1, 1, values[0].length).setValues(values);
  return row;
}

/** 履歴1行をオブジェクトで返す */
function getHistoryRecord(row) {
  const sheet = getRequiredSheet_(IQ.SHEETS.HISTORY);
  if (row < 2 || row > sheet.getLastRow()) return null;
  const r = sheet.getRange(row, 1, 1, IQ_HISTORY_HEADERS.length).getValues()[0];
  if (!normalizeText(r[0]) || !normalizeText(r[1])) return null;
  const tz = getTimeZone_();
  return {
    row: row,
    type: String(r[IQ_HISTORY_COL.type - 1]),
    number: normalizeText(r[IQ_HISTORY_COL.number - 1]),
    customerName: normalizeText(r[IQ_HISTORY_COL.customerName - 1]),
    amount: Number(r[IQ_HISTORY_COL.amount - 1]) || 0,
    url: normalizeText(r[IQ_HISTORY_COL.url - 1]),
    status: String(r[IQ_HISTORY_COL.status - 1]),
    customerId: normalizeText(r[IQ_HISTORY_COL.customerId - 1]),
    subject: normalizeText(r[IQ_HISTORY_COL.subject - 1]),
    docDate: dateToParts(r[IQ_HISTORY_COL.docDate - 1], tz),
    deadline: dateToParts(r[IQ_HISTORY_COL.deadline - 1], tz),
  };
}

/** 発行履歴シートで選択中の行（他のシートにいる場合は最終行）の履歴 */
function getSelectedOrLastHistoryRecord_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = getRequiredSheet_(IQ.SHEETS.HISTORY);
  let row = sheet.getLastRow();
  const active = ss.getActiveSheet();
  if (active && active.getName() === IQ.SHEETS.HISTORY) {
    const r = active.getActiveRange();
    if (r && r.getRow() >= 2) row = r.getRow();
  }
  return getHistoryRecord(row);
}
